/**
 * 静态资源服务器配置文件
 */
module.exports = {
  // 服务器端口
  port: 3000,
  
  // 默认提供的目录（如果命令行未指定）
  defaultDir: './output',
  
  // 允许的文件类型及其MIME类型
  mimeTypes: {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain'
  },
  
  // 图片文件扩展名
  imageExtensions: ['.png', '.jpg', '.jpeg', '.gif', '.svg'],
  
  // 是否启用目录浏览
  enableDirectoryListing: true,
  
  // 是否渲染Markdown文件
  renderMarkdown: true,
  
  // 缓存控制
  cacheControl: 'max-age=3600', // 1小时缓存
  
  // 跨域设置
  cors: {
    enabled: true,
    allowOrigin: '*',
    allowMethods: 'GET, HEAD, OPTIONS',
    allowHeaders: 'Content-Type'
  }
}; 