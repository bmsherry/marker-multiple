const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * 流式执行命令并返回Promise
 * @param {string} command 要执行的命令
 * @param {string[]} args 命令参数
 * @returns {Promise<boolean>} 执行是否成功
 */
function spawnCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`执行命令: ${command} ${args.join(' ')}`);
    
    const childProcess = spawn(command, args, { shell: false });
    
    // 实时输出标准输出
    childProcess.stdout.on('data', (data) => {
      process.stdout.write(`${data}`);
    });
    
    // 实时输出标准错误
    childProcess.stderr.on('data', (data) => {
      process.stderr.write(`${data}`);
    });
    
    // 命令执行完成
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        console.error(`命令执行失败，退出码: ${code}`);
        resolve(false);
      }
    });
    
    // 命令执行出错
    childProcess.on('error', (error) => {
      console.error(`命令执行出错: ${error.message}`);
      reject(error);
    });
    childProcess.stdout.setEncoding('utf8');
  });
}

/**
 * 替换Markdown文件中的图片路径
 * @param {string} mdFilePath Markdown文件路径
 * @param {string} folderName 文件夹名称
 * @returns {Promise<boolean>} 替换是否成功
 */
async function replaceImagePaths(mdFilePath, folderName) {
  try {
    // 读取Markdown文件内容
    let content = fs.readFileSync(mdFilePath, 'utf8');
    
    // 替换图片路径，匹配以_page开头，以.jpeg结尾的字符串
    const regex = /(_page[^)]+\.jpeg)/g;
    content = content.replace(regex, `http://localhost:3000/${folderName}/$1`);
    
    // 写回文件
    fs.writeFileSync(mdFilePath, content, 'utf8');
    console.log(`已更新图片路径: ${mdFilePath}`);
    return true;
  } catch (error) {
    console.error(`替换图片路径失败: ${error.message}`);
    return false;
  }
}

/**
 * 处理输出文件夹中的Markdown文件
 * @param {string} outputFolderPath 输出文件夹路径
 * @param {string} folderName 文件夹名称
 * @returns {Promise<boolean>} 处理是否成功
 */
async function processMarkdownFiles(outputFolderPath, folderName) {
  try {
    // 检查文件夹是否存在
    if (!fs.existsSync(outputFolderPath)) {
      console.error(`输出文件夹不存在: ${outputFolderPath}`);
      return false;
    }
    
    // 读取文件夹中的所有文件
    const files = fs.readdirSync(outputFolderPath);
    
    // 过滤出Markdown文件
    const mdFiles = files.filter(file => path.extname(file).toLowerCase() === '.md');
    
    if (mdFiles.length === 0) {
      console.log(`未在 ${outputFolderPath} 中找到Markdown文件`);
      return true;
    }
    
    console.log(`找到 ${mdFiles.length} 个Markdown文件，开始处理...`);
    
    // 处理所有Markdown文件
    for (const mdFile of mdFiles) {
      const mdFilePath = path.join(outputFolderPath, mdFile);
      await replaceImagePaths(mdFilePath, folderName);
    }
    
    console.log(`所有Markdown文件处理完成`);
    return true;
  } catch (error) {
    console.error(`处理Markdown文件时发生错误: ${error.message}`);
    return false;
  }
}

/**
 * 处理单个 PDF 文件
 * @param {string} pdfPath PDF 文件完整路径
 * @param {string} outputDir 输出目录
 * @returns {Promise<boolean>} 处理是否成功
 */
async function processPdf(pdfPath, outputDir) {
  // 获取 PDF 文件名（不含扩展名）
  const pdfFileName = path.basename(pdfPath, '.pdf');
  // 预期的输出文件夹路径
  const outputFolderPath = path.join(outputDir, pdfFileName);

  // 检查输出目录中是否已存在同名文件夹
  if (fs.existsSync(outputFolderPath)) {
    console.log(`跳过处理: ${pdfFileName} (输出文件夹已存在)`);
    return true;
  }
  
  try {
    console.log(`开始处理: ${pdfFileName}`);
    
    // 转换为绝对路径
    const absolutePdfPath = path.resolve(pdfPath);
    const absoluteOutputDir = path.resolve(outputDir);
    
    // 使用spawn执行命令
    const success = await spawnCommand('marker_single', [
      absolutePdfPath,
      '--output_dir',
      absoluteOutputDir
    ]);
    
    if (!success) {
      console.error(`处理 ${pdfFileName} 失败`);
      
      // 如果处理出错，删除可能创建的输出文件夹
      if (fs.existsSync(outputFolderPath)) {
        try {
          fs.rmdirSync(outputFolderPath, { recursive: true });
          console.log(`已删除错误输出文件夹: ${outputFolderPath}`);
        } catch (deleteError) {
          console.error(`删除文件夹 ${outputFolderPath} 失败: ${deleteError.message}`);
        }
      }
      return false;
    } else {
      console.log(`成功处理: ${pdfFileName}`);
      
      // 处理生成的Markdown文件中的图片路径
      await processMarkdownFiles(outputFolderPath, pdfFileName);
      
      return true;
    }
  } catch (error) {
    console.error(`处理 ${pdfFileName} 时发生异常: ${error.message}`);
    
    // 处理异常情况下也尝试删除可能创建的输出文件夹
    if (fs.existsSync(outputFolderPath)) {
      try {
        fs.rmdirSync(outputFolderPath, { recursive: true });
        console.log(`已删除错误输出文件夹: ${outputFolderPath}`);
      } catch (deleteError) {
        console.error(`删除文件夹 ${outputFolderPath} 失败: ${deleteError.message}`);
      }
    }
    return false;
  }
}

/**
 * 串行处理文件夹中的所有 PDF 文件
 * @param {string} inputDir 输入目录
 * @param {string} outputDir 输出目录
 */
async function processAllPdfs(inputDir, outputDir) {
  try {
    // 转换为绝对路径
    const absoluteInputDir = path.resolve(inputDir);
    const absoluteOutputDir = path.resolve(outputDir);
    
    // 确保输入目录存在
    if (!fs.existsSync(absoluteInputDir)) {
      console.error(`输入目录不存在: ${absoluteInputDir}`);
      return;
    }
    
    // 确保输出目录存在
    if (!fs.existsSync(absoluteOutputDir)) {
      fs.mkdirSync(absoluteOutputDir, { recursive: true });
      console.log(`创建输出目录: ${absoluteOutputDir}`);
    }
    
    // 读取目录中的所有文件
    const files = fs.readdirSync(absoluteInputDir);
    
    // 过滤出 PDF 文件
    const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
    
    if (pdfFiles.length === 0) {
      console.log('未找到 PDF 文件');
      return;
    }
    
    console.log(`找到 ${pdfFiles.length} 个 PDF 文件，开始处理...`);
    
    // 统计处理结果
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    
    // 串行处理所有 PDF 文件
    for (const pdfFile of pdfFiles) {
      const pdfPath = path.join(absoluteInputDir, pdfFile);
      const pdfFileName = path.basename(pdfFile, '.pdf');
      const outputFolderPath = path.join(absoluteOutputDir, pdfFileName);
      
      // 检查输出目录中是否已存在同名文件夹
      if (fs.existsSync(outputFolderPath)) {
        console.log(`跳过处理: ${pdfFileName} (输出文件夹已存在)`);
        skipCount++;
        continue;
      }
      
      const result = await processPdf(pdfPath, absoluteOutputDir);
      if (result) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    console.log('所有 PDF 文件处理完成');
    console.log(`处理结果: 成功 ${successCount} 个, 跳过 ${skipCount} 个, 失败 ${failCount} 个`);
  } catch (error) {
    console.error(`处理过程中发生错误: ${error.message}`);
  }
}

// 命令行参数处理
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('用法: node pdf_processor.js <输入目录> <输出目录>');
  process.exit(1);
}

const inputDir = args[0];
const outputDir = args[1];

// 开始处理
processAllPdfs(inputDir, outputDir); 

// node pdf_processor.js ./pdf文件夹 ./输出目录