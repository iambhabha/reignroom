import subprocess
import sys

import pytest

from reignroom_agent import __main__ as cli
from reignroom_agent import site


def test_token_is_kept_between_runs_and_renewed_on_request(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    first = cli.load_or_create_token(renew=False)
    assert cli.load_or_create_token(renew=False) == first
    assert cli.load_or_create_token(renew=True) != first
    assert (tmp_path / "ReignRoom" / "agent-token.txt").read_text() != first


@pytest.mark.skipif(sys.platform != "win32", reason="Windows ACLs")
def test_token_file_is_readable_only_by_this_user_and_system(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    cli.load_or_create_token(renew=True)
    acl = subprocess.run(
        ["icacls", str(tmp_path / "ReignRoom" / "agent-token.txt")], capture_output=True, text=True
    ).stdout
    text = acl.lower()
    assert "(i)" not in text  # nothing inherited
    assert "nt authority\\system:(f)" in text
    assert "builtin\\users" not in text and "everyone" not in text and "authenticated users" not in text
    assert "builtin\\administrators" not in text


@pytest.mark.skipif(sys.platform != "win32", reason="Windows ACLs")
def test_token_file_drops_explicit_admin_entries(tmp_path):
    # What a file made by an elevated process looks like (as on GitHub's Windows runners).
    path = tmp_path / "agent-token.txt"
    path.write_text("x")
    subprocess.run(["icacls", str(path), "/grant", "*S-1-5-32-544:F", "*S-1-3-4:F"], capture_output=True, check=True)
    cli.restrict_to_current_user(path)
    text = subprocess.run(["icacls", str(path)], capture_output=True, text=True).stdout.lower()
    assert "builtin\\administrators" not in text and "owner rights" not in text
    assert "nt authority\\system:(f)" in text


def test_release_build_trusts_only_the_bundled_site(tmp_path, monkeypatch):
    (tmp_path / "site_origin.txt").write_text("https://reignroom.example.workers.dev\n")
    monkeypatch.setattr(site, "_bundle_dir", lambda: tmp_path)
    assert site.release_origin() == "https://reignroom.example.workers.dev"


@pytest.mark.parametrize("bad", ["http://reignroom.example", "https://x.example/path", "*", ""])
def test_rejects_malformed_bundled_origins(tmp_path, monkeypatch, bad):
    (tmp_path / "site_origin.txt").write_text(bad)
    monkeypatch.setattr(site, "_bundle_dir", lambda: tmp_path)
    assert site.release_origin() is None


def test_refuses_to_start_without_any_site(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(site, "_bundle_dir", lambda: tmp_path)
    monkeypatch.setattr(cli, "release_origin", site.release_origin)
    assert cli.main(["--dry-run"]) == 2
    assert "doesn't know the ReignRoom site address" in capsys.readouterr().out
