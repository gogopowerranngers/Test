const { Telegraf, Markup } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const BOT_TOKEN = '7916834209:AAErLxieYriWb0FFHqF2-T_rjlXAfqiY12c';
const bot = new Telegraf(BOT_TOKEN);

const userSessions = new Map();

function extractProxies(content) {
    const proxies = new Set();
    const lines = content.split('\n');
    
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        
        if (trimmed.includes(':')) {
            const proxyLine = trimmed.includes('://') ? trimmed.split('://')[1] : trimmed;
            const parts = proxyLine.split(':');
            
            if (parts.length >= 2) {
                const ipPart = parts[0];
                if (ipPart.includes('.')) {
                    const ipNumbers = ipPart.split('.');
                    if (ipNumbers.length === 4 && ipNumbers.every(n => /^\d+$/.test(n))) {
                        proxies.add(trimmed);
                    }
                }
            }
        }
    }
    
    return Array.from(proxies);
}

bot.start((ctx) => {
    const userId = ctx.from.id;
    
    userSessions.set(userId, {
        files: [],
        allProxies: new Set(),
        fileStats: new Map()
    });
    
    ctx.replyWithMarkdown(
        `🤖 *Proxy Batch Combiner Bot*\n\n` +
        `Send me multiple proxy files, then use /combine to merge them all!\n\n` +
        `*How to use:*\n` +
        `1️⃣ Send me your proxy.txt files (as many as you want)\n` +
        `2️⃣ Use /list to see what you've uploaded\n` +
        `3️⃣ Use /combine when you're ready to merge\n` +
        `4️⃣ I'll send back one combined file with all unique proxies\n\n` +
        `*Commands:*\n` +
        `/combine - Merge all uploaded files\n` +
        `/list - Show uploaded files\n` +
        `/stats - Show proxy statistics\n` +
        `/clear - Clear all uploaded files\n` +
        `/help - Show help`
    );
});

bot.help((ctx) => {
    ctx.replyWithMarkdown(
        `📚 *Proxy Batch Combiner Help*\n\n` +
        `*Workflow:*\n` +
        `1️⃣ Send multiple .txt files with proxies\n` +
        `2️⃣ Use /list to see uploaded files\n` +
        `3️⃣ Use /combine to merge them all\n` +
        `4️⃣ Get one combined file with unique proxies\n\n` +
        `*Commands:*\n` +
        `/combine - Merge all uploaded files\n` +
        `/list - Show uploaded files\n` +
        `/stats - Show proxy statistics\n` +
        `/clear - Clear all files\n` +
        `/help - Show this message\n\n` +
        `*Tips:*\n` +
        `• You can also paste proxies directly\n` +
        `• Duplicates are automatically removed\n` +
        `• File format is preserved\n` +
        `• Use /clear to start fresh`
    );
});

bot.on('document', async (ctx) => {
    const userId = ctx.from.id;
    const document = ctx.message.document;
    
    if (!document.file_name.endsWith('.txt')) {
        return ctx.reply('❌ Please send only .txt files!');
    }
    
    if (!userSessions.has(userId)) {
        userSessions.set(userId, {
            files: [],
            allProxies: new Set(),
            fileStats: new Map()
        });
    }
    
    const session = userSessions.get(userId);
    const processingMsg = await ctx.reply(`📥 Receiving ${document.file_name}...`);
    
    try {
        const fileLink = await ctx.telegram.getFileLink(document.file_id);
        const response = await fetch(fileLink.href);
        const content = await response.text();
        
        const proxies = extractProxies(content);
        
        if (proxies.length > 0) {
            const fileInfo = {
                name: document.file_name,
                file_id: document.file_id,
                proxyCount: proxies.length,
                uniqueInFile: new Set(proxies).size,
                timestamp: new Date().toLocaleTimeString()
            };
            
            session.files.push(fileInfo);
            session.fileStats.set(document.file_name, fileInfo);
            
            const oldCount = session.allProxies.size;
            proxies.forEach(p => session.allProxies.add(p));
            const newCount = session.allProxies.size;
            
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                processingMsg.message_id,
                null,
                `✅ *File saved:* \`${document.file_name}\`\n` +
                `• Proxies in file: ${proxies.length}\n` +
                `• Unique in file: ${new Set(proxies).size}\n` +
                `• Total unique across all files: ${newCount}\n\n` +
                `📁 Files uploaded: ${session.files.length}\n` +
                `Use /combine when you're ready to merge!`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                processingMsg.message_id,
                null,
                `❌ No valid proxies found in \`${document.file_name}\``,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        console.error(error);
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            null,
            `❌ Error processing file: ${error.message}`
        );
    }
});

bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    
    const userId = ctx.from.id;
    const text = ctx.message.text;
    
    if (!userSessions.has(userId)) {
        userSessions.set(userId, {
            files: [],
            allProxies: new Set(),
            fileStats: new Map()
        });
    }
    
    const session = userSessions.get(userId);
    const proxies = extractProxies(text);
    
    if (proxies.length > 0) {
        const fileName = `pasted_proxies_${session.files.length + 1}.txt`;
        
        const fileInfo = {
            name: fileName,
            file_id: 'pasted',
            proxyCount: proxies.length,
            uniqueInFile: new Set(proxies).size,
            timestamp: new Date().toLocaleTimeString(),
            isPasted: true
        };
        
        session.files.push(fileInfo);
        session.fileStats.set(fileName, fileInfo);
        
        const oldCount = session.allProxies.size;
        proxies.forEach(p => session.allProxies.add(p));
        const newCount = session.allProxies.size;
        
        ctx.replyWithMarkdown(
            `✅ *Text saved as:* \`${fileName}\`\n` +
            `• Proxies found: ${proxies.length}\n` +
            `• Unique: ${new Set(proxies).size}\n` +
            `• Total unique across all files: ${newCount}\n\n` +
            `📁 Files uploaded: ${session.files.length}\n` +
            `Use /combine to merge all!`
        );
    } else {
        ctx.reply('❌ No valid proxies found in your message.');
    }
});

bot.command('list', (ctx) => {
    const userId = ctx.from.id;
    
    if (!userSessions.has(userId) || userSessions.get(userId).files.length === 0) {
        return ctx.reply('📁 No files uploaded yet. Send me some proxy files!');
    }
    
    const session = userSessions.get(userId);
    const files = session.files;
    const totalProxies = session.allProxies.size;
    
    let message = `📁 *Uploaded Files (${files.length} total)*\n`;
    message += `📊 *Total unique proxies:* ${totalProxies}\n\n`;
    
    files.forEach((file, i) => {
        const icon = file.isPasted ? '📝 ' : '📄 ';
        message += `${icon}\`${file.name}\`\n`;
        message += `   • Proxies: ${file.proxyCount} (unique: ${file.uniqueInFile})\n`;
        message += `   • Added: ${file.timestamp}\n\n`;
    });
    
    ctx.replyWithMarkdown(message, Markup.inlineKeyboard([
        [Markup.button.callback('🔀 Combine Now', 'combine_now')],
        [Markup.button.callback('🗑 Clear All', 'clear_all')]
    ]));
});

bot.command('stats', (ctx) => {
    const userId = ctx.from.id;
    
    if (!userSessions.has(userId) || userSessions.get(userId).files.length === 0) {
        return ctx.reply('No files uploaded yet.');
    }
    
    const session = userSessions.get(userId);
    const allProxies = Array.from(session.allProxies);
    const files = session.files;
    
    const formats = {
        'ip:port': 0,
        'ip:port:user:pass': 0,
        'protocol': 0,
        'auth_protocol': 0,
        'other': 0
    };
    
    allProxies.forEach(proxy => {
        if (proxy.includes('://')) {
            if (proxy.includes('@')) {
                formats['auth_protocol']++;
            } else {
                formats['protocol']++;
            }
        } else if (proxy.includes(':')) {
            const parts = proxy.split(':');
            if (parts.length === 2) {
                formats['ip:port']++;
            } else if (parts.length === 4) {
                formats['ip:port:user:pass']++;
            } else {
                formats['other']++;
            }
        }
    });
    
    let message = `📊 *Proxy Statistics*\n\n`;
    message += `• Total unique proxies: ${allProxies.length}\n`;
    message += `• Total files: ${files.length}\n`;
    message += `• Total proxies (with duplicates): ${files.reduce((sum, f) => sum + f.proxyCount, 0)}\n\n`;
    
    message += `*Format Breakdown:*\n`;
    for (const [fmt, count] of Object.entries(formats)) {
        if (count > 0) {
            const percentage = (count / allProxies.length) * 100;
            message += `  • ${fmt}: ${count} (${percentage.toFixed(1)}%)\n`;
        }
    }
    
    ctx.replyWithMarkdown(message);
});

bot.command('combine', async (ctx) => {
    const userId = ctx.from.id;
    
    if (!userSessions.has(userId) || userSessions.get(userId).files.length === 0) {
        return ctx.reply('❌ No files to combine. Send me some proxy files first!');
    }
    
    const session = userSessions.get(userId);
    const processingMsg = await ctx.reply(
        `🔄 Combining files...\n` +
        `• Files: ${session.files.length}\n` +
        `• Total unique proxies: ${session.allProxies.size}`
    );
    
    try {
        const allProxies = Array.from(session.allProxies).sort();
        const tempFile = path.join(os.tmpdir(), `${uuidv4()}.txt`);
        
        let content = `# Combined Proxy File\n`;
        content += `# Generated: ${new Date().toLocaleString()}\n`;
        content += `# Source files: ${session.files.length}\n`;
        content += `# Total unique proxies: ${allProxies.length}\n`;
        content += `#${'='.repeat(50)}\n\n`;
        content += allProxies.join('\n');
        
        await fs.writeFile(tempFile, content, 'utf8');
        
        await ctx.replyWithDocument(
            { source: tempFile, filename: `combined_${allProxies.length}_proxies.txt` },
            { caption: `✅ Combined ${allProxies.length} unique proxies from ${session.files.length} files!` }
        );
        
        await fs.unlink(tempFile);
        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
        
        ctx.replyWithMarkdown(
            `✨ *Done!* What would you like to do next?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📁 Add More Files', 'add_more')],
                [Markup.button.callback('🗑 Clear & Start Over', 'clear_all')],
                [Markup.button.callback('📊 View Stats', 'view_stats')]
            ])
        );
        
    } catch (error) {
        console.error(error);
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            null,
            `❌ Error combining files: ${error.message}`
        );
    }
});

bot.command('clear', (ctx) => {
    const userId = ctx.from.id;
    
    if (userSessions.has(userId)) {
        const session = userSessions.get(userId);
        const fileCount = session.files.length;
        const proxyCount = session.allProxies.size;
        
        userSessions.set(userId, {
            files: [],
            allProxies: new Set(),
            fileStats: new Map()
        });
        
        ctx.reply(
            `🗑 Cleared ${fileCount} files and ${proxyCount} proxies.\n` +
            `Ready for new files!`
        );
    } else {
        ctx.reply('Nothing to clear.');
    }
});

bot.action('combine_now', (ctx) => {
    ctx.deleteMessage();
    bot.command('combine')(ctx);
});

bot.action('clear_all', (ctx) => {
    ctx.deleteMessage();
    bot.command('clear')(ctx);
});

bot.action('view_stats', (ctx) => {
    ctx.deleteMessage();
    bot.command('stats')(ctx);
});

bot.action('add_more', (ctx) => {
    ctx.editMessageText(
        '📁 Send more files! I\'ll add them to the existing collection.\n' +
        'Use /combine again when you\'re ready.'
    );
});

bot.launch().then(() => {
    console.log('🤖 Proxy Batch Combiner Bot is running...');
    console.log('Users can send multiple files, then use /combine to merge!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
