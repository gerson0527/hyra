import net from 'node:net'

const START_PORT = Number(process.env.HYRA_DEV_PORT ?? 4200)
const MAX_PORT = Number(process.env.HYRA_DEV_MAX_PORT ?? 4299)

function probe(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(true))
    server.once('listening', () => server.close(() => resolve(false)))
    server.listen(port, '127.0.0.1')
  })
}

async function main() {
  for (let port = START_PORT; port <= MAX_PORT; port += 1) {
    const inUse = await probe(port)
    if (inUse) {
      console.error(`[hyra] Puerto ${port} ocupado, buscando siguiente libre…`)
      continue
    }
    console.log(port)
    return
  }
  console.error(`[hyra] No hay puertos libres entre ${START_PORT} y ${MAX_PORT}.`)
  process.exit(1)
}

main()