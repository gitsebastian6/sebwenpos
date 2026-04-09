import ZAI, { VisionMessage } from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {
  const imageData = fs.readFileSync('/home/z/my-project/upload/pasted_image_1775674217378.png');
  const base64Image = imageData.toString('base64');
  const imageUrl = `data:image/png;base64,${base64Image}`;

  const zai = await ZAI.create();
  const messages: VisionMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Describe exactly what you see in this screenshot. Is there an error message? What does the page show? Describe in detail.' },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }
  ];

  const response = await zai.chat.completions.createVision({
    model: 'glm-4.6v',
    messages,
    thinking: { type: 'disabled' }
  });

  const reply = response.choices?.[0]?.message?.content;
  console.log(reply);
}

main().catch(err => console.error(err.message || err));
