"""Errors a caller can show to a person."""


class WaziError(Exception):
    """A predictable failure: invalid input, a bad snapshot, or a contract breach."""


class NotFoundError(WaziError):
    """The artwork id has not been submitted."""


class SnapshotError(WaziError):
    """Stored atoms could not be restored safely."""
