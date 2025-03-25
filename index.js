const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const config = require('./config');

// 从配置文件获取设置
const PORT = process.env.PORT || config.port;
const ROOT_DIR = path.resolve(process.argv[2] || config.defaultDir);
const MIME_TYPES = config.mimeTypes;
const IMAGE_EXTENSIONS = config.imageExtensions;

// 创建服务器
const server = http.createServer((req, res) => {
  // 处理CORS
  if (config.cors.enabled) {
    res.setHeader('Access-Control-Allow-Origin', config.cors.allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', config.cors.allowMethods);
    res.setHeader('Access-Control-Allow-Headers', config.cors.allowHeaders);
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
  }
  
  // 解析请求URL
  const parsedUrl = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  
  // 规范化路径，防止目录遍历攻击
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(ROOT_DIR, safePath);
  
  // 检查文件/目录是否存在
  fs.stat(filePath, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // 文件不存在
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>404 未找到</h1><p>找不到路径: ${pathname}</p>`);
      } else {
        // 其他错误
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>500 服务器内部错误</h1><p>${err.message}</p>`);
      }
      return;
    }
    
    if (stats.isDirectory()) {
      // 处理目录
      if (config.enableDirectoryListing) {
        handleDirectory(filePath, pathname, res);
      } else {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>403 禁止访问</h1><p>目录浏览已禁用</p>');
      }
    } else {
      // 处理文件
      handleFile(filePath, res);
    }
  });
});

/**
 * 处理目录请求
 * @param {string} dirPath 目录的物理路径
 * @param {string} urlPath 目录的URL路径
 * @param {http.ServerResponse} res 响应对象
 */
function handleDirectory(dirPath, urlPath, res) {
  fs.readdir(dirPath, { withFileTypes: true }, (err, files) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>500 服务器内部错误</h1><p>读取目录失败: ${err.message}</p>`);
      return;
    }
    
    // 生成HTML
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>目录: ${urlPath}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; }
          h1 { border-bottom: 1px solid #ddd; padding-bottom: 10px; }
          ul { list-style-type: none; padding: 0; }
          li { margin: 8px 0; }
          a { text-decoration: none; color: #0366d6; }
          a:hover { text-decoration: underline; }
          .directory { font-weight: bold; }
          .directory:before { content: "📁 "; }
          .file:before { content: "📄 "; }
          .image:before { content: "🖼️ "; }
          .markdown:before { content: "📝 "; }
          .back:before { content: "⬆️ "; }
        </style>
      </head>
      <body>
        <h1>目录: ${urlPath || '/'}</h1>
        <ul>
    `;
    
    // 添加返回上级目录的链接（如果不是根目录）
    if (urlPath !== '/') {
      const parentPath = urlPath.split('/').slice(0, -1).join('/') || '/';
      html += `<li><a href="${parentPath}" class="back">返回上级目录</a></li>`;
    }
    
    // 先显示目录，再显示文件
    const directories = [];
    const markdownFiles = [];
    const imageFiles = [];
    const otherFiles = [];
    
    files.forEach(file => {
      const fileName = file.name;
      const filePath = path.join(urlPath, fileName);
      const fileExt = path.extname(fileName).toLowerCase();
      
      if (file.isDirectory()) {
        directories.push(`<li><a href="${filePath}" class="directory">${fileName}</a></li>`);
      } else if (fileExt === '.md') {
        markdownFiles.push(`<li><a href="${filePath}" class="markdown">${fileName}</a></li>`);
      } else if (IMAGE_EXTENSIONS.includes(fileExt)) {
        imageFiles.push(`<li><a href="${filePath}" class="image">${fileName}</a></li>`);
      } else {
        otherFiles.push(`<li><a href="${filePath}" class="file">${fileName}</a></li>`);
      }
    });
    
    html += directories.join('');
    html += markdownFiles.join('');
    html += imageFiles.join('');
    html += otherFiles.join('');
    
    html += `
        </ul>
      </body>
      </html>
    `;
    
    res.writeHead(200, { 
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': config.cacheControl
    });
    res.end(html);
  });
}

/**
 * 处理文件请求
 * @param {string} filePath 文件路径
 * @param {http.ServerResponse} res 响应对象
 */
function handleFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  
  // 如果是Markdown文件，提供HTML渲染版本
  if (ext === '.md' && config.renderMarkdown) {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>500 服务器内部错误</h1><p>读取文件失败: ${err.message}</p>`);
        return;
      }
      
      // 简单的Markdown渲染（仅支持基本语法）
      const html = renderMarkdown(data, filePath);
      
      res.writeHead(200, { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': config.cacheControl
      });
      res.end(html);
    });
    return;
  }
  
  // 其他文件类型
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  
  // 使用流式传输文件
  const fileStream = fs.createReadStream(filePath);
  
  fileStream.on('error', (err) => {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>500 服务器内部错误</h1><p>读取文件失败: ${err.message}</p>`);
  });
  
  res.writeHead(200, { 
    'Content-Type': contentType,
    'Cache-Control': config.cacheControl
  });
  fileStream.pipe(res);
}

/**
 * 简单的Markdown渲染函数
 * @param {string} markdown Markdown内容
 * @param {string} filePath 文件路径
 * @returns {string} 渲染后的HTML
 */
function renderMarkdown(markdown, filePath) {
  // 这里使用非常简单的正则表达式替换来渲染Markdown
  // 在实际应用中，建议使用成熟的Markdown解析库，如marked或markdown-it
  
  const fileName = path.basename(filePath);
  const dirPath = path.dirname(filePath);
  const relativePath = path.relative(ROOT_DIR, dirPath);
  const urlPath = '/' + relativePath.replace(/\\/g, '/');
  
  // 替换图片链接，使其指向正确的路径
  markdown = markdown.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
    // 如果src是相对路径，转换为服务器URL路径
    if (!src.startsWith('http') && !src.startsWith('/')) {
      src = path.join(urlPath, src).replace(/\\/g, '/');
    }
    return `<img src="${src}" alt="${alt}" style="max-width:100%;">`;
  });
  
  // 基本Markdown语法转换
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${fileName}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
        h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: .3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: .3em; }
        a { color: #0366d6; text-decoration: none; }
        a:hover { text-decoration: underline; }
        pre { background-color: #f6f8fa; border-radius: 3px; padding: 16px; overflow: auto; }
        code { font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace; background-color: rgba(27,31,35,.05); border-radius: 3px; padding: .2em .4em; }
        blockquote { margin: 0; padding: 0 1em; color: #6a737d; border-left: .25em solid #dfe2e5; }
        img { max-width: 100%; }
        table { border-collapse: collapse; width: 100%; overflow: auto; }
        table th, table td { padding: 6px 13px; border: 1px solid #dfe2e5; }
        table tr { background-color: #fff; border-top: 1px solid #c6cbd1; }
        table tr:nth-child(2n) { background-color: #f6f8fa; }
        .back-link { display: block; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <a href="${urlPath}" class="back-link">⬅️ 返回目录</a>
      <div class="markdown-body">
        ${parseMarkdown(markdown)}
      </div>
    </body>
    </html>
  `;
  
  return html;
}

/**
 * 简单的Markdown解析函数
 * @param {string} markdown Markdown文本
 * @returns {string} 解析后的HTML
 */
function parseMarkdown(markdown) {
  // 这是一个非常简单的Markdown解析器，仅支持基本语法
  // 在实际应用中，建议使用成熟的库
  
  let html = markdown;
  
  // 标题
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  
  // 粗体和斜体
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // 链接
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
  
  // 图片已在前面处理
  
  // 代码块
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // 列表
  html = html.replace(/^\* (.*$)/gm, '<ul><li>$1</li></ul>');
  html = html.replace(/^- (.*$)/gm, '<ul><li>$1</li></ul>');
  html = html.replace(/^([0-9]+)\. (.*$)/gm, '<ol><li>$2</li></ol>');
  
  // 合并相邻的列表项
  html = html.replace(/<\/ul><ul>/g, '');
  html = html.replace(/<\/ol><ol>/g, '');
  
  // 段落
  html = html.replace(/^\s*$/gm, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '');
  
  return html;
}

// 启动服务器
server.listen(PORT, () => {
  console.log(`静态资源服务器运行在 http://localhost:${PORT}`);
  console.log(`提供目录: ${ROOT_DIR}`);
  console.log(`配置: 目录浏览${config.enableDirectoryListing ? '已启用' : '已禁用'}, Markdown渲染${config.renderMarkdown ? '已启用' : '已禁用'}`);
});
