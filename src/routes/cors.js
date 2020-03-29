const METHODS = [
  'PUT',
  'PATCH',
  'OPTIONS',
]

const HEADERS = [
  'Authorization',
  'Content-Type',
]

// TODO use only defined domains instead of *
export default (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', METHODS.join(','))
  res.header('Access-Control-Allow-Headers', HEADERS.join(','))
  return req.method === 'OPTIONS' ? res.sendStatus(200) : next()
}
