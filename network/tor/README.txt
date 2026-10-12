Workspace private peer mail — Tor runtime

This folder contains a separately verified Tor Expert Bundle 15.0.24 and its
provisioning/supervision tools. The original SOPHIA Tor files were preserved.
SOURCE_AUDIT.json records the supplied file hashes and verification limits.
verified-runtime.json records the installed publisher signature and every
runtime file hash. Tor's licence and bundled dependency licences are in
runtime/docs. The build-only OpenPGP.js verifier includes its LGPL licence.

The workspace launcher owns its own hidden Tor process. It uses SOCKS at
127.0.0.1:19150, authenticated local control at 127.0.0.1:19151, and a version-3
onion service whose virtual port 80 forwards to the dedicated local peer-mail
listener (normally 127.0.0.1:8788). It publishes no public TCP listener, relay,
workspace page, administrative API, terminal, or arbitrary forwarding option.
The existing SOPHIA bridges and pluggable-transport settings are not activated.

Tor creates and retains its own service identity under network-state/tor.
Private directory permissions allow the current Windows account, SYSTEM and
Administrators. Preserve this directory to retain this computer's onion
address. A portable distribution for another computer must omit both state/
and network-state/: each computer creates its own vault and onion identity.
Do not copy service secret keys into invitations or deliverables.

The launcher can start the local mailbox as soon as the onion hostname is
created; this does not claim Tor has completed network bootstrap. Status
reports bootstrap progress separately. The public peer-endpoint metadata is
written after bootstrap succeeds. App-specific peer invitations additionally
bind the account and the peer-mail protocol; an onion hostname alone is not a
mail-account authorization.

Configuration paths retain quoted absolute Windows drive paths with escaped
backslashes. Tor notice logging uses stdout; both output streams are drained
into bounded 8 KiB memory tails. Startup failures remain diagnosable without
file-log path parsing or an unbounded notice log. Bootstrap progress is retained
numerically when the output tail advances. Diagnostics are omitted from the
public peer-endpoint metadata. Existing log files are preserved.

Dot-source Workspace-Tor.ps1, then use:

  $tor = Start-WorkspaceTor -WorkspaceRoot $root -PeerPort 8788
  $status = Wait-WorkspaceTorIdentity $tor -TimeoutSeconds 30 -Pump $uiPump
  Get-WorkspaceTorStatus $tor
  Stop-WorkspaceTor $tor

Start verifies the complete installed runtime, refuses occupied ports or an
existing owner lock, and does not stop pre-existing processes. Stop verifies
the exact owned process ID, start time and executable. It authenticates the
control server with SAFECOOKIE before requesting a controlled shutdown; only
that owned process can receive a forced-stop fallback. Tor also monitors the
owning launcher's process ID so an abandoned child does not remain running.

To provision a fresh runtime, use Install-WorkspaceTor.ps1 with a local official
bundle, its detached signature, and the official Tor Developers public key.
The installer verifies the complete fingerprint and strict detached signature
before extracting anything. It never replaces an installed runtime or runs a
provided executable. Verify-TorBundle.mjs uses the bundled, hash-pinned
OpenPGP.js 6.3.2 verifier; an optional -UseGpg mode uses installed GnuPG.

Offline checks (no Tor execution or external network; temporary loopback bind
probes verify occupied-port refusal and socket cleanup):

  powershell.exe -NoProfile -File network/tor/Test-WorkspaceTor.ps1

Primary sources:
https://download.torproject.org/tor/
https://support.torproject.org/tor-browser/getting-started/verifying-tor-browser/
https://community.torproject.org/onion-services/setup/
https://spec.torproject.org/control-spec/commands.html
https://github.com/openpgpjs/openpgpjs
