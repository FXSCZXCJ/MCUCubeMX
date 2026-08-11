import { describe, expect, it } from 'vitest'
import * as ejs from 'ejs'
import { GPIO_H_TEMPLATE } from '../src/lib/codegen/templates'

// 模拟浏览器环境：vite.config 将 fs/path 别名到空 stub，验证 ejs client 编译不依赖 node 内置模块
describe('浏览器端 EJS 编译', () => {
  it('client:true 编译并渲染模板', () => {
    const compiled = ejs.compile('<h1><%= title %></h1><% items.forEach(function(i){ %><p><%= i %></p><% }); %>', {
      client: true,
    })
    const html = compiled({ title: 'hello', items: ['a', 'b'] }) as string
    expect(html).toContain('<h1>hello</h1>')
    expect(html).toContain('<p>a</p>')
    expect(html).toContain('<p>b</p>')
  })

  it('生成器使用的主模板可被 client 编译', () => {
    const compiled = ejs.compile(GPIO_H_TEMPLATE, { client: true })
    const out = compiled({ device: 'GD32L233RCT6', prefix: 'MX_', hasExti: false, groups: [] }) as string
    expect(out).toContain('#ifndef __GPIO_H')
    expect(out).toContain('void MX_GPIO_Init(void);')
  })
})
