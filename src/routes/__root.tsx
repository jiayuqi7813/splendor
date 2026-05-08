/// <reference types="vite/client" />
import type { CSSProperties } from 'react'
import type { ReactNode } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { assetPath } from '@/utils/paths'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Gem Duel Arena' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body style={rootBodyStyle}>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

const rootBodyStyle = {
  '--table-background-image': `url(${assetPath('duel-splendor/tabletops/birch-boardgame-table.png')})`,
} as CSSProperties
