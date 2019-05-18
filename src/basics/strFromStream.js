function strFromStream(stream) {
  return `[Stream #${stream.id} { producer: ${
    stream.producerStatus
  }, consumer: ${stream.consumerStatus}, buffer.length: ${
    stream.buffer.length
  } }]`;
}

module.exports = strFromStream;
