import { generateHTMLFromPrompt, readFile } from './server.js';

export async function generateContent(userPrompt) {
    const HTML = await generateHTMLFromPrompt(userPrompt, 'index.html');
    console.log(HTML.length);
}

export async function modifyContent(modifications) {
    let userPrompt = `I am not happy with the code you have generated and I need these things changed in this code: ${modifications}\n\n\n`; 
    const HTML = await readFile("./index.html");
    userPrompt += HTML;
    const endingPrompt = `\n\n\nSo here are the required modifications: ${modifications}`
    userPrompt += endingPrompt;
    const newHTML = await generateHTMLFromPrompt(userPrompt, 'index.html');
    console.log(newHTML.length);
}