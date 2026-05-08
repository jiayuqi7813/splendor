import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { constants as zlibConstants, createBrotliCompress, createGzip } from 'node:zlib'
import app from './dist/server/server.js'

const port = Number(process.env.PORT || 3000)
const basePath = normalizeBasePath(process.env.APP_BASE_PATH || '/')
const clientRoot = new URL('./dist/client/', import.meta.url)

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

const precompressedStaticExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt'])

function normalizeBasePath(value) {
  if (!value || value === '/') return ''
  return `/${value.replace(/^\/+|\/+$/g, '')}`
}

function stripBasePath(pathname) {
  if (!basePath) return pathname
  if (pathname === basePath) return '/'
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length)
  return undefined
}

function toRequest(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`
  const url = new URL(req.url || '/', `${protocol}://${host}`)
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req)
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body,
    duplex: body ? 'half' : undefined,
  })
}

function acceptsEncoding(req, encoding) {
  const header = Array.isArray(req.headers['accept-encoding'])
    ? req.headers['accept-encoding'].join(',')
    : (req.headers['accept-encoding'] ?? '')
  return header
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .some((item) => {
      const [name, ...params] = item.split(';').map((part) => part.trim())
      if (name !== encoding && name !== '*') return false
      return !params.some((param) => /^q=0(?:\.0+)?$/.test(param))
    })
}

function preferredCompression(req) {
  if (acceptsEncoding(req, 'br')) return 'br'
  if (acceptsEncoding(req, 'gzip')) return 'gzip'
  return undefined
}

function compressionStream(encoding) {
  if (encoding === 'br') {
    return createBrotliCompress({
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
      },
    })
  }
  return createGzip({ level: 4 })
}

function withCompressionHeaders(headers, encoding) {
  const nextHeaders = { ...headers }
  delete nextHeaders['content-length']
  nextHeaders['content-encoding'] = encoding
  nextHeaders.vary = nextHeaders.vary ? `${nextHeaders.vary}, Accept-Encoding` : 'Accept-Encoding'
  return nextHeaders
}

function responseCanCompress(response, pathname) {
  if (response.headers.has('content-encoding')) return false
  if (pathname.startsWith('/api/')) return false
  const contentType = response.headers.get('content-type') ?? ''
  const normalizedContentType = contentType.toLowerCase()
  return !normalizedContentType.startsWith('text/event-stream') && !normalizedContentType.startsWith('application/json')
}

async function staticVariant(target, extension, encoding) {
  if (!encoding || !precompressedStaticExtensions.has(extension)) return undefined
  const variant = new URL(`${target.pathname}.${encoding}`, target)
  try {
    const variantStat = await stat(variant)
    return variantStat.isFile() ? { target: variant, size: variantStat.size } : undefined
  } catch {
    return undefined
  }
}

async function serveStatic(req, res, pathname) {
  const relativePath = stripBasePath(pathname)
  if (!relativePath?.startsWith('/assets/')) return false
  const target = new URL(`.${relativePath}`, clientRoot)
  if (!target.pathname.startsWith(clientRoot.pathname)) return false
  let fileStat
  try {
    fileStat = await stat(target)
  } catch {
    return false
  }
  if (!fileStat.isFile()) return false
  const extension = target.pathname.slice(target.pathname.lastIndexOf('.'))
  const encoding = preferredCompression(req)
  const variant = await staticVariant(target, extension, encoding)
  const headers = {
    'content-type': contentTypes[extension] || 'application/octet-stream',
    'cache-control': relativePath.startsWith('/assets/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    'content-length': variant?.size ?? fileStat.size,
  }
  res.writeHead(200, variant ? withCompressionHeaders(headers, encoding) : headers)
  if (req.method === 'HEAD') {
    res.end()
    return true
  }
  await pipeline(createReadStream(variant?.target ?? target), res)
  return true
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    if (basePath && url.pathname === `${basePath}/`) {
      url.pathname = basePath
    }
    if (basePath && stripBasePath(url.pathname) === undefined) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
    if (await serveStatic(req, res, url.pathname)) return
    const response = await app.fetch(toRequest(req))
    const encoding = response.body && req.method !== 'HEAD' && responseCanCompress(response, url.pathname) ? preferredCompression(req) : undefined
    const responseHeaders = Object.fromEntries(response.headers.entries())
    res.writeHead(response.status, encoding ? withCompressionHeaders(responseHeaders, encoding) : responseHeaders)
    if (!response.body || req.method === 'HEAD') {
      res.end()
      return
    }
    const source = Readable.fromWeb(response.body)
    if (encoding) {
      await pipeline(source, compressionStream(encoding), res)
    } else {
      await pipeline(source, res)
    }
  } catch (error) {
    if (error?.code === 'ERR_STREAM_PREMATURE_CLOSE') return
    if (res.headersSent) {
      console.error(error)
      res.destroy(error)
      return
    }
    console.error(error)
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Internal Server Error')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Gem Duel Arena listening on :${port}${basePath || '/'}`)
})
