// Safari cannot `for await` over a ReadableStream, which the phonemizer inside kokoro-js does while loading.
const streamProto = ReadableStream.prototype as ReadableStream & { [Symbol.asyncIterator]?: unknown }

if (!streamProto[Symbol.asyncIterator]) {
  streamProto[Symbol.asyncIterator] = async function* <T>(this: ReadableStream<T>) {
    const reader = this.getReader()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
}
