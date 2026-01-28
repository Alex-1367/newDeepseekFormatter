function extractConversationFromDOM() {
  // Try to find message containers - these are common CSS classes in chat apps
  const selectors = [
    '[data-testid*="message"]',
    '[class*="message"]',
    '[class*="Message"]',
    '.message',
    '.chat-message',
    '.conversation-item',
    '.msg',
    'div[class*="group"]'
  ];

  let messages = [];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 2) {
      console.log(`Found ${elements.length} elements with selector: ${selector}`);

      elements.forEach((el, index) => {
        const text = el.innerText.trim();
        if (text.length > 10 && !text.includes('Viacheslav Eremin')) {
          const isLikelyUser = text.includes('?') ||
                               text.length < 150 ||
                               text.startsWith('I ') ||
                               text.startsWith('get me') ||
                               text.startsWith('is this');

          const isLikelyAI = text.includes('Excellent') ||
                            text.includes('Key Points') ||
                            text.includes('Example:') ||
                            text.includes('✅') ||
                            text.length > 300;

          const role = isLikelyUser && !isLikelyAI ? 'USER' :
                      isLikelyAI && !isLikelyUser ? 'AI' : 'UNKNOWN';

          messages.push({ role, text, index });
        }
      });

      if (messages.length > 5) break;
    }
  }

  if (messages.length < 3) {
    console.log('DOM approach failed');
    return null;
  }

  let output = 'CONVERSATION EXTRACTED FROM DOM\n' + '='.repeat(50) + '\n\n';

  messages.forEach(msg => {
    const header = msg.role === 'USER' ? '❓ YOU:' : '📘 AI:';
    output += `${header}\n${msg.text}\n\n${'─'.repeat(30)}\n\n`;
  });

  return output;
}

// Usage:
const result = extractConversationFromDOM();
if (result) {
  const blob = new Blob([result], {type: 'text/plain'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'Chat_Extract_' + new Date().toISOString().slice(0,10) + '.txt';
  link.click();
  console.log('✅ Extraction successful!');
}
