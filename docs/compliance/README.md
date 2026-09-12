# Compliance pack

This folder holds the living Security & Privacy documentation for מה שכחתי?.
It exists so operational, infrastructure and privacy decisions stay next to
the code that implements them.

## Audit baselines

- Feature / Control Center baseline used for the security audit:
  `feature/smith-control-center @ 372a0a9e747bf4365022ef1387e21225a54aebec`
- Production application baseline used for the dependency audit:
  `main @ 39e5c8b3d52b3c2d0e15612fda2f807530961c79`

## P0 status

The legacy chat-receipt `SECURITY DEFINER` EXECUTE hardening is already
applied on managed Supabase Production as migration version
`20260912182738` (`restrict_legacy_chat_receipt_rpc_execute`).

This repository now contains a local reconciliation file only. It must not be
applied again to Production.

## Living documents

Update these files when any of the following change:

- data flows
- processors
- retention
- infrastructure
- authentication
- backup architecture
- Smith permissions

## Legal boundary

These documents are technical and organizational working records. They are not
a substitute for legal advice.
