import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

const publicDir = './public';
const outputDir = './dist';

function convertMarkdownToHtml() {
  if (!fs.existsSync(publicDir)) {
    console.log('Public directory not found');
    return;
  }

  const files = fs.readdirSync(publicDir);
  const markdownFiles = files.filter(file => file.endsWith('.md'));

  if (markdownFiles.length === 0) {
    console.log('No markdown files found');
    return;
  }

  console.log(`Converting ${markdownFiles.length} markdown files...`);

  markdownFiles.forEach(file => {
    const filePath = path.join(publicDir, file);
    const markdown = fs.readFileSync(filePath, 'utf8');
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${file.replace('.md', '')}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
        code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
        pre code { background: none; padding: 0; }
        blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 20px; color: #666; }
        h1, h2, h3 { color: #333; }
        a { color: #0066cc; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    ${marked(markdown)}
</body>
</html>`;

    const outputFile = file.replace('.md', '.html');
    const outputPath = path.join(outputDir, outputFile);
    
    fs.writeFileSync(outputPath, html);
    console.log(`Converted ${file} → ${outputFile}`);
  });

  console.log('Markdown conversion complete!');
}

convertMarkdownToHtml();