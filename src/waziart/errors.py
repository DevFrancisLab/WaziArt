"""Errors a caller can show to a person."""


class WaziError(Exception):
    """A predictable failure: invalid input, a bad snapshot, or a contract breach."""


class NotFoundError(WaziError):
    """The artwork id has not been submitted."""


class SnapshotError(WaziError):
    """Stored atoms could not be restored safely."""


class ProviderError(WaziError):
    """The optional explanation provider failed. The MeTTa review is unchanged."""

    def __init__(self, message: str, http_status: int = 502):
        super().__init__(message)
        self.http_status = http_status
