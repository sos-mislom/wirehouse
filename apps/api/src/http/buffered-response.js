// A response must not acknowledge a mutation until PostgreSQL COMMIT succeeds.
// Current routes return complete JSON/files and do not stream response bodies.
export function bufferedResponse(response) {
  let status = 200;
  let headers = {};
  let body;
  let ended = false;
  return {
    get statusCode() {
      return status;
    },
    get writableEnded() {
      return ended;
    },
    writeHead(code, fields = {}) {
      status = code;
      headers = fields;
    },
    end(value) {
      if (ended) throw new Error("Response already completed");
      body = value;
      ended = true;
    },
    flush() {
      if (!ended) throw new Error("Route did not complete its response");
      response.writeHead(status, headers);
      response.end(body);
    },
  };
}
