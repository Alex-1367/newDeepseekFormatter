import fs from 'fs/promises';
import path from 'path';
import { format, parseISO, compareDesc } from 'date-fns';
import chalk from 'chalk';

export default class DeepSeekFormatter {
    constructor(options = {}) {
        this.outputDir = options.outputDir || './formatted_chats';
        this.inputFile = options.inputFile || 'conversations.json';
        this.verbose = options.verbose || false;
        
        this.stats = {
            totalConversations: 0,
            totalMessages: 0,
            processedFiles: 0,
            errors: 0
        };
    }

    async formatAll() {
        try {
            console.log(chalk.blue('📚 Starting DeepSeek Formatter'));
            console.log(chalk.gray(`Input: ${this.inputFile}`));
            console.log(chalk.gray(`Output: ${this.outputDir}`));

            // Check if input file exists
            try {
                await fs.access(this.inputFile);
            } catch {
                throw new Error(`Input file not found: ${this.inputFile}`);
            }

            // Read and parse input
            const data = await fs.readFile(this.inputFile, 'utf8');
            let conversations = JSON.parse(data);
            
            if (!Array.isArray(conversations)) {
                throw new Error('Invalid JSON format: Expected an array of conversations');
            }
            
            // Sort conversations by date (inserted_at) descending (most recent first)
            conversations = this.sortConversationsByDate(conversations);
            
            this.stats.totalConversations = conversations.length;
            console.log(chalk.cyan(`Found ${this.stats.totalConversations} conversations`));

            // Create output directory
            await fs.mkdir(this.outputDir, { recursive: true });

            // Process each conversation (already sorted)
            for (let i = 0; i < conversations.length; i++) {
                await this.processConversation(conversations[i], i);
            }

            // Generate summary
            await this.generateSummary(conversations);

            console.log(chalk.green.bold('\n✅ Formatting completed!'));
            console.log(chalk.gray(`📁 Output: ${path.resolve(this.outputDir)}`));
            this.printStats();

        } catch (error) {
            console.error(chalk.red.bold('\n❌ Error:'), error.message);
            if (this.verbose) {
                console.error(chalk.red('Stack trace:'), error.stack);
                console.error(chalk.yellow('Current stats:'), this.stats);
            }
            process.exit(1);
        }
    }

    sortConversationsByDate(conversations) {
        try {
            return conversations.sort((a, b) => {
                try {
                    const dateA = a.updated_at || a.inserted_at;
                    const dateB = b.updated_at || b.inserted_at;
                    
                    if (!dateA && !dateB) return 0;
                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    
                    const timeA = new Date(dateA).getTime();
                    const timeB = new Date(dateB).getTime();
                    
                    // Sort descending (most recent first)
                    return timeB - timeA;
                } catch {
                    return 0;
                }
            });
        } catch (error) {
            console.log(chalk.yellow('Warning: Error sorting conversations:', error.message));
            return conversations;
        }
    }

    async processConversation(conversation, index) {
        try {
            // Number conversations in reverse order (1 = most recent)
            const fileNumber = (index + 1).toString().padStart(3, '0');
            
            // Get date for filename prefix
            const datePrefix = this.getDatePrefix(conversation);
            
            const safeTitle = this.sanitizeFilename(conversation.title || `conversation-${fileNumber}`);
            const fileName = `${datePrefix}-${fileNumber}-${safeTitle}.html`;
            const filePath = path.join(this.outputDir, fileName);

            if (this.verbose) {
                const date = this.formatTimestamp(conversation.updated_at || conversation.inserted_at);
                console.log(chalk.blue(`Processing ${fileNumber}/${this.stats.totalConversations}: ${conversation.title || 'Untitled'} (${date})`));
            }

            const html = this.generateHTML(conversation, fileNumber);
            
            await fs.writeFile(filePath, html);
            this.stats.processedFiles++;
            
            if (!this.verbose) {
                process.stdout.write(chalk.gray('.'));
            }
        } catch (error) {
            this.stats.errors++;
            console.log(chalk.red(`\nError processing conversation ${index + 1}:`), error.message);
            if (this.verbose) {
                console.error(chalk.yellow('Conversation data:'), JSON.stringify(conversation, null, 2));
            }
        }
    }

    getDatePrefix(conversation) {
        try {
            const dateStr = conversation.updated_at || conversation.inserted_at;
            if (!dateStr) return 'nodate';
            
            const date = new Date(dateStr);
            return format(date, 'yyyy-MM-dd');
        } catch {
            return 'nodate';
        }
    }

    generateHTML(conversation, fileNumber) {
        try {
            const messages = this.extractMessages(conversation.mapping);
            this.stats.totalMessages += messages.length;

            // Get conversation data with fallbacks
            const title = this.safeString(conversation.title) || `Conversation ${fileNumber}`;
            const id = this.safeString(conversation.id) || 'unknown-id';
            const created = this.safeString(conversation.inserted_at) || 'unknown';
            const updated = this.safeString(conversation.updated_at) || 'unknown';
            
            // Get formatted dates for display
            const createdFormatted = this.formatTimestamp(created);
            const updatedFormatted = this.formatTimestamp(updated);

            let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DeepSeek Chat: ${this.escapeHtml(title)}</title>
    <style>
        ${this.getCSS()}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="conversation-meta">
                <span class="conversation-number">Conversation #${fileNumber}</span>
                <span class="conversation-date">${updatedFormatted}</span>
            </div>
            <h1 class="title">${this.escapeHtml(title)}</h1>
            <div class="meta">
                ID: ${id}<br>
                Created: ${createdFormatted}<br>
                Updated: ${updatedFormatted}
            </div>
        </div>`;

        // Add messages
        let messageNumber = 1;
        for (const message of messages) {
            if (message && message.fragments && Array.isArray(message.fragments)) {
                for (const fragment of message.fragments) {
                    if (fragment && fragment.type && fragment.content) {
                        const isRequest = fragment.type === 'REQUEST';
                        const headerText = isRequest 
                            ? `Request ${messageNumber}`
                            : `Response ${messageNumber}`;
                        
                        const time = this.safeString(message.inserted_at) || 'unknown';
                        const content = this.safeString(fragment.content) || '';
                        
                        htmlContent += `
        <div class="chat-message ${isRequest ? 'request' : 'response'}">
            <div class="message-header">
                <h2>${headerText}</h2>
                <span class="message-time">${this.formatTimestamp(time)}</span>
            </div>
            <div class="message-content">${this.formatContent(content)}</div>
        </div>`;
                        
                        if (isRequest) messageNumber++;
                    }
                }
            }
        }

        htmlContent += `
        <div class="footer">
            <div class="footer-stats">
                Generated by DeepSeek Formatter • ${new Date().toLocaleDateString()}<br>
                Total messages: ${messages.length} • Conversation date: ${createdFormatted}
            </div>
            <div class="navigation">
                <span class="nav-info">Sorted by date (newest first)</span>
            </div>
        </div>
    </div>
</body>
</html>`;

            return htmlContent;
        } catch (error) {
            console.error(chalk.red(`Error generating HTML for conversation ${fileNumber}:`), error.message);
            return `<html><body><h1>Error processing conversation</h1><p>${error.message}</p></body></html>`;
        }
    }

    extractMessages(mapping) {
        const messages = [];
        
        if (!mapping || typeof mapping !== 'object') {
            console.log(chalk.yellow('Warning: Invalid or missing mapping object'));
            return messages;
        }
        
        try {
            let currentId = mapping.root?.children?.[0];
            
            while (currentId && mapping[currentId]) {
                const node = mapping[currentId];
                if (node && node.message) {
                    messages.push(node.message);
                }
                currentId = node && node.children && node.children.length > 0 ? node.children[0] : null;
            }
        } catch (error) {
            console.log(chalk.yellow('Warning: Error extracting messages:', error.message));
        }
        
        return messages;
    }

    formatContent(content) {
        if (!content || typeof content !== 'string') {
            return '';
        }
        
        try {
            let formatted = this.escapeHtml(content);
            
            // Format code blocks
            formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
                return `<pre><code>${this.escapeHtml(code.trim())}</code></pre>`;
            });
            
            // Format inline code
            formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
            
            // Format headers
            formatted = formatted.replace(/^### (.+)$/gm, '<h4>$1</h4>');
            formatted = formatted.replace(/^## (.+)$/gm, '<h3>$1</h3>');
            formatted = formatted.replace(/^# (.+)$/gm, '<h2>$1</h2>');
            
            // Format bold and italic
            formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
            
            // Format lists
            formatted = formatted.replace(/^- (.+)$/gm, '<li>$1</li>');
            formatted = formatted.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
            
            // Format links
            formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
            
            // Format line breaks
            formatted = formatted.replace(/\n/g, '<br>');
            
            return formatted;
        } catch (error) {
            console.log(chalk.yellow('Warning: Error formatting content:', error.message));
            return this.escapeHtml(content);
        }
    }

    getCSS() {
        return `
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 15px rgba(0,0,0,0.1);
        }
        .header {
            border-bottom: 3px solid #ff4444;
            padding-bottom: 15px;
            margin-bottom: 30px;
            position: relative;
        }
        .conversation-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-size: 14px;
        }
        .conversation-number {
            background: #ff4444;
            color: white;
            padding: 4px 10px;
            border-radius: 4px;
            font-weight: bold;
        }
        .conversation-date {
            color: #666;
            font-style: italic;
        }
        .title {
            color: #ff4444;
            font-size: 24px;
            margin: 0 0 10px 0;
            border-left: 4px solid #ff4444;
            padding-left: 15px;
        }
        .meta {
            color: #666;
            font-size: 14px;
            line-height: 1.5;
            background: #f8f9fa;
            padding: 10px 15px;
            border-radius: 6px;
            margin-top: 10px;
        }
        .chat-message {
            margin-bottom: 25px;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid;
        }
        .request {
            background-color: #fff5f5;
            border-left-color: #ff4444;
        }
        .response {
            background-color: #f0fff4;
            border-left-color: #28a745;
        }
        .message-header {
            font-weight: bold;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .message-header h2 {
            color: #ff4444;
            margin: 0;
            font-size: 20px;
        }
        .message-time {
            font-size: 12px;
            color: #888;
            font-weight: normal;
        }
        .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
            font-size: 15px;
            line-height: 1.5;
        }
        pre {
            background-color: #1e1e1e;
            color: #d4d4d4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            font-family: 'Courier New', monospace;
        }
        code {
            background-color: #f8f9fa;
            padding: 2px 5px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
        }
        .footer-stats {
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-bottom: 15px;
        }
        .navigation {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: #888;
        }
        .nav-info {
            font-style: italic;
        }
        a {
            color: #ff4444;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }`;
    }

    async generateSummary(conversations) {
        try {
            const summary = {
                generated: new Date().toISOString(),
                totalConversations: conversations.length,
                totalMessages: this.stats.totalMessages,
                processedFiles: this.stats.processedFiles,
                errors: this.stats.errors,
                sorting: "by date descending (most recent first)",
                conversations: conversations.map((conv, i) => ({
                    number: i + 1,
                    id: this.safeString(conv.id),
                    title: this.safeString(conv.title),
                    date: this.safeString(conv.updated_at || conv.inserted_at),
                    formattedDate: this.formatTimestamp(conv.updated_at || conv.inserted_at),
                    file: `${this.getDatePrefix(conv)}-${(i + 1).toString().padStart(3, '0')}-${this.sanitizeFilename(conv.title || `conversation-${i + 1}`)}.html`,
                    created: this.safeString(conv.inserted_at),
                    updated: this.safeString(conv.updated_at),
                    messageCount: this.extractMessages(conv.mapping).length
                }))
            };

            await fs.writeFile(
                path.join(this.outputDir, 'summary.json'),
                JSON.stringify(summary, null, 2)
            );
            
            // Also generate a sorted index.html
            await this.generateIndexHTML(conversations);
            
            console.log(chalk.green('📄 Generated summary.json and index.html'));

        } catch (error) {
            console.log(chalk.yellow('Warning: Error generating summary:', error.message));
        }
    }

    async generateIndexHTML(conversations) {
        try {
            let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DeepSeek Conversations Index</title>
    <style>
        ${this.getIndexCSS()}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>DeepSeek Conversations</h1>
            <div class="subtitle">Sorted by date (newest first) • ${conversations.length} conversations</div>
        </div>
        
        <div class="sort-info">
            <span class="sort-badge">📅 Sorted by date</span>
            <span class="sort-order">Most recent first</span>
        </div>
        
        <table class="conversations-table">
            <thead>
                <tr>
                    <th width="80">#</th>
                    <th width="120">Date</th>
                    <th>Title</th>
                    <th width="100">Messages</th>
                    <th width="100">File</th>
                </tr>
            </thead>
            <tbody>`;

            for (let i = 0; i < conversations.length; i++) {
                const conv = conversations[i];
                const date = this.formatTimestamp(conv.updated_at || conv.inserted_at);
                const messages = this.extractMessages(conv.mapping);
                const fileName = `${this.getDatePrefix(conv)}-${(i + 1).toString().padStart(3, '0')}-${this.sanitizeFilename(conv.title || `conversation-${i + 1}`)}.html`;
                
                html += `
                <tr>
                    <td class="number">${i + 1}</td>
                    <td class="date">${date}</td>
                    <td class="title">
                        <a href="${fileName}">${this.escapeHtml(conv.title || `Conversation ${i + 1}`)}</a>
                        <div class="conversation-id">${conv.id}</div>
                    </td>
                    <td class="messages">${messages.length}</td>
                    <td class="file-link">
                        <a href="${fileName}" class="view-btn">View</a>
                    </td>
                </tr>`;
            }

            html += `
            </tbody>
        </table>
        
        <div class="footer">
            <div class="stats">
                Generated: ${new Date().toLocaleString()}<br>
                Total conversations: ${conversations.length} • Total messages: ${this.stats.totalMessages}
            </div>
            <div class="legend">
                <span class="legend-item"><span class="legend-color request"></span> User requests (red)</span>
                <span class="legend-item"><span class="legend-color response"></span> AI responses (green)</span>
            </div>
        </div>
    </div>
</body>
</html>`;

            await fs.writeFile(path.join(this.outputDir, 'index.html'), html);
        } catch (error) {
            console.log(chalk.yellow('Warning: Error generating index.html:', error.message));
        }
    }

    getIndexCSS() {
        return `
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f7fa;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #ff4444;
        }
        h1 {
            color: #ff4444;
            margin: 0 0 10px 0;
        }
        .subtitle {
            color: #666;
            font-size: 16px;
        }
        .sort-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8f9fa;
            padding: 10px 15px;
            border-radius: 6px;
            margin-bottom: 20px;
        }
        .sort-badge {
            background: #ff4444;
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-weight: bold;
        }
        .sort-order {
            color: #666;
            font-style: italic;
        }
        .conversations-table {
            width: 100%;
            border-collapse: collapse;
        }
        .conversations-table th {
            background: #f8f9fa;
            padding: 12px 15px;
            text-align: left;
            color: #333;
            font-weight: 600;
            border-bottom: 2px solid #ddd;
        }
        .conversations-table td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
        }
        .conversations-table tr:hover {
            background: #f9f9f9;
        }
        .number {
            text-align: center;
            font-weight: bold;
            color: #ff4444;
        }
        .date {
            color: #666;
            font-size: 14px;
        }
        .title a {
            color: #333;
            text-decoration: none;
            font-weight: 500;
            font-size: 16px;
        }
        .title a:hover {
            color: #ff4444;
        }
        .conversation-id {
            color: #888;
            font-size: 12px;
            font-family: monospace;
            margin-top: 5px;
        }
        .messages {
            text-align: center;
            font-weight: bold;
        }
        .file-link {
            text-align: center;
        }
        .view-btn {
            display: inline-block;
            background: #ff4444;
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            text-decoration: none;
            font-size: 14px;
        }
        .view-btn:hover {
            background: #e03e3e;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
        }
        .stats {
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
        }
        .legend {
            display: flex;
            justify-content: center;
            gap: 20px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #666;
        }
        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 3px;
        }
        .legend-color.request {
            background: #ff4444;
        }
        .legend-color.response {
            background: #28a745;
        }`;
    }

    // Utility methods
    safeString(value) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        return String(value);
    }

    escapeHtml(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }
        
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    sanitizeFilename(filename) {
        if (!filename || typeof filename !== 'string') {
            return 'untitled';
        }
        
        return filename
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .substring(0, 50)
            .trim();
    }

    formatTimestamp(timestamp) {
        if (!timestamp) {
            return 'unknown';
        }
        
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) {
                return timestamp;
            }
            return format(date, 'yyyy-MM-dd HH:mm:ss');
        } catch {
            return timestamp;
        }
    }

    printStats() {
        console.log('\n' + chalk.cyan('📊 Statistics:'));
        console.log(chalk.gray(`   Conversations: ${this.stats.totalConversations} (sorted by date)`));
        console.log(chalk.gray(`   Total messages: ${this.stats.totalMessages}`));
        console.log(chalk.gray(`   Files created: ${this.stats.processedFiles}`));
        if (this.stats.errors > 0) {
            console.log(chalk.yellow(`   Errors: ${this.stats.errors}`));
        }
    }
}