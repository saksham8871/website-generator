import {
    GoogleGenAI,
    HarmCategory,
    HarmBlockThreshold
} from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const MODEL = 'gemini-2.5-flash-preview-04-17';
// const MODEL = 'gemini-2.5-pro-preview-03-25';

const SYSTEM_PROMPT_PATH = './prompts/systemPrompt.txt';
const EXAMPLE_APP_PATH1 = './prompts/exampleApp1.html';
const EXAMPLE_APP_PATH2 = './prompts/exampleApp2.html';
const EXAMPLE_APP_PATH3 = './prompts/exampleApp3.html';

// Initialize safety settings
const getSafetySettings = () => [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// Get generation configuration
const getGenerationConfig = () => ({
    temperature: 0.7,
    maxOutputTokens: 8192,
    responseMimeType: 'text/plain',
});

// Read a file and return its contents
export async function readFile(filePath) {
    try {
        const fullPath = path.resolve(process.cwd(), filePath);
        console.log(`Reading file: ${fullPath}`);
        const content = await fs.readFile(fullPath, 'utf-8');
        if (!content) {
            console.warn(`Warning: File content is empty for ${filePath}`);
        }
        return content;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`File not found at ${filePath}`);
        } else {
            throw new Error(`Failed to read ${filePath}: ${error.message}`);
        }
    }
}

// Sanitize the generated content
function sanitizeOutput(content) {
    if (!content) return '';
    let cleaned = content.replace(/```[a-zA-Z]*\n([\s\S]*?)\n```/g, '$1');

    cleaned = cleaned.replace(/<\/?(think|thought|function_call|tool_code|tool_outputs)[\s\S]*?>/gi, '');
    cleaned = cleaned.trim();

    const htmlMatch = cleaned.match(/<html[\s\S]*<\/html>/i);
    if (htmlMatch) {
        const doctypeMatch = cleaned.match(/<!DOCTYPE html>/i);
        if (doctypeMatch && cleaned.indexOf(doctypeMatch[0]) < cleaned.indexOf(htmlMatch[0])) {
            return doctypeMatch[0] + '\n' + htmlMatch[0];
        }
        return htmlMatch[0];
    }

    console.warn("Warning: No <html> tags found in the sanitized output. Returning cleaned content.");
    return cleaned;
}

// Save content to a file
async function saveToFile(content, filename) {
    try {
        if (!content) {
            console.warn(`\nSkipping save: Content is empty.`);
            return false;
        }
        await fs.writeFile(filename, content);
        console.log(`\nSuccessfully saved to ${filename}`);
        return true;
    } catch (error) {
        console.error('\nSave Error:', error.message);
        return false;
    }
}

// Initialize the AI client
function initializeAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Missing GEMINI_API_KEY in environment variables');
    }
    return new GoogleGenAI({ apiKey });
}

// Main function to generate HTML content from a prompt
export async function generateHTMLFromPrompt(prompt, outputFilename = null) {
    try {
        console.log('Initializing Content Generator...');

        // Initialize AI
        const ai = initializeAI();

        // Read necessary files
        const systemInstructionText = await readFile(SYSTEM_PROMPT_PATH);
        const exampleHTML1 = await readFile(EXAMPLE_APP_PATH1);
        const exampleHTML2 = await readFile(EXAMPLE_APP_PATH2);
        const exampleHTML3 = await readFile(EXAMPLE_APP_PATH3);

        if (!systemInstructionText) {
            console.warn(`Warning: System prompt file (${SYSTEM_PROMPT_PATH}) content is empty or file not found.`);
        }
        if (!exampleHTML1) {
            throw new Error(`Example file (${EXAMPLE_APP_PATH1}) content is empty or file not found.`);
        }
        if (!exampleHTML2) {
            throw new Error(`Example file (${EXAMPLE_APP_PATH2}) content is empty or file not found.`);
        }
        if (!exampleHTML3) {
            throw new Error(`Example file (${EXAMPLE_APP_PATH3}) content is empty or file not found.`);
        }

        console.log('Initialization complete.');
        console.log(`\nGenerating HTML for: "${prompt}" using ${MODEL}\n`);

        // Prepare the content for the AI
        const contents = [
            {
                role: 'user',
                parts: [{ text: `${systemInstructionText}\n\n---\n\nEXAMPLE TASK: Generate an example application.` }],
            },
            {
                role: 'model',
                parts: [{ text: exampleHTML1 }],
            },
            {
                role: 'user',
                parts: [{ text: `EXAMPLE TASK: Generate another example application.` }],
            },
            {
                role: 'model',
                parts: [{ text: exampleHTML2 }],
            },
            {
                role: 'user',
                parts: [{ text: `EXAMPLE TASK: Generate a last example application.` }],
            },
            {
                role: 'model',
                parts: [{ text: exampleHTML3 }],
            },
            {
                role: 'user',
                parts: [{ text: `Now I am going to ask you for real applications, think thoroughly before generating the response, think about all the functionalities, UI, UX, aesthetics, all the requirements demanded must be followed. Let's start building the project.\n\nJust say YES is you understood the task.` }],
            },
            {
                role: 'model',
                parts: [{ text: `YES` }],
            },
            {
                role: 'user',
                parts: [{ text: `Here is your task:\n${prompt}` }],
            },
        ];

        console.log("Sending request to Gemini API...");

        // Generate content using AI
        const stream = await ai.models.generateContentStream({
            model: MODEL,
            contents: contents,
            generationConfig: getGenerationConfig(),
            safetySettings: getSafetySettings(),
        });

        // Process the stream
        let generatedContent = '';
        process.stdout.write("Streaming response: ");
        for await (const chunk of stream) {
            if (chunk.promptFeedback?.blockReason) {
                console.error(`\nRequest blocked: ${chunk.promptFeedback.blockReason}`);
                console.error("Safety Ratings:", chunk.promptFeedback.safetyRatings);
                throw new Error(`Content generation blocked due to safety settings: ${chunk.promptFeedback.blockReason}`);
            }

            const chunkText = chunk.text;
            if (chunkText) {
                process.stdout.write(chunkText);
                generatedContent += chunkText;
            }
        }
        console.log("\n--- End of Stream ---");

        if (!generatedContent) {
            console.warn("\nWarning: Generated content is empty. This might be due to safety settings, the prompt, or model behavior.");
        }

        // Clean up the generated content
        const sanitizedContent = sanitizeOutput(generatedContent);

        // Save to file if filename is provided
        if (outputFilename) {
            await saveToFile(sanitizedContent, outputFilename);
        }

        return sanitizedContent;

    } catch (error) {
        console.error('\nGeneration Error:', error.message);
        if (error.response?.data) {
            console.error('API Response Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.cause) {
            console.error('Error Cause:', error.cause);
        }
        throw error;
    }
}
