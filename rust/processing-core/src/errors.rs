#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProcessingError {
    InvalidProtocol,
    InvalidDimensions,
    SourceRequired,
    SourceSizeMismatch { expected: usize, actual: usize },
    CacheMiss,
    InvalidBufferLength,
}
