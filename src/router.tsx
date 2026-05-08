import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { appPath } from './utils/paths'

export function getRouter() {
  return createRouter({
    routeTree,
    basepath: appPath('/').replace(/\/$/, '') || undefined,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
