import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
    Part,
    CountTokensRequest,
    Content,
} from '@google/generative-ai'
import _ from 'lodash'
import { ISafetySetting, IGenerationConfig, IChatItem, IGeminiTokenCountProps, Roles } from './interface'
import { inputTokenLimit } from '@/app/shared/constants'
import { GeminiModel } from './interface'
import * as dotenv from 'dotenv'
dotenv.config()

const { GOOGLE_GEMINI_API_KEY = '' } = process.env || {}

const genAI = new GoogleGenerativeAI(GOOGLE_GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: GeminiModel.geminiPro })
const modelProVision = genAI.getGenerativeModel({ model: GeminiModel.geminiProVision })

const defaultGenerationConfig: IGenerationConfig = {
    temperature: 0.9,
    topK: 1,
    topP: 1,
    maxOutputTokens: 2048,
}

const defaultSafetySettings: ISafetySetting[] = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
]

interface IGeminiChatProps {
    generationConfig?: IGenerationConfig
    safetySettings?: ISafetySetting[]
    history?: IChatItem[]
    inputText: string
    isStream?: boolean
}

export const GeminiChat = async ({
    generationConfig,
    safetySettings,
    history,
    inputText,
    isStream,
}: IGeminiChatProps) => {
    let error = `input text is required.`
    if (!inputText)
        return {
            status: false,
            text: ``,
            error,
        }

    let params: Partial<IGeminiChatProps> = {
        generationConfig: {
            ...defaultGenerationConfig,
            ...generationConfig,
        },
        safetySettings: _.isEmpty(safetySettings)
            ? defaultSafetySettings
            : _.map(defaultSafetySettings, ss => {
                  const category = ss.category
                  const newSS = _.find(safetySettings, category)
                  return {
                      ...ss,
                      threshold: newSS?.threshold || ss.threshold,
                  }
              }),
        history: _.map(history, h => {
            return {
                role: h.role,
                parts: h.parts,
            }
        }),
    }
    if (_.isEmpty(history)) {
        delete params.history
    }

    try {
        const chat = model.startChat(params)

        const currentHistory = await chat.getHistory()
        const { totalTokens } = await model.countTokens({
            contents: [...currentHistory, { role: 'user', parts: [{ text: inputText }] }],
        })
        if (isStream) {
            const streamResult = await chat.sendMessageStream(inputText)
            let text = ''
            for await (const chunk of streamResult.stream) {
                const chunkText = chunk.text()
                console.log(chunkText)
                text += chunkText
            }

            return {
                status: true,
                text,
                totalTokens,
            }
        }
        const result = await chat.sendMessage(inputText)

        const response = result.response
        return {
            status: true,
            text: response.text(),
            totalTokens,
        }
    } catch (e) {
        console.log(`GeminiChat error`, e)
        error = String(e)
    }

    return {
        status: false,
        text: ``,
        error,
    }
}

interface IGeminiContentProps {
    generationConfig?: IGenerationConfig
    safetySettings?: ISafetySetting[]
    prompt?: string
    parts?: Part[]
    isStream?: boolean
}
export const GeminiContent = async ({
    generationConfig,
    safetySettings,
    parts,
    isStream,
    prompt,
}: IGeminiContentProps) => {
    let error = `promopt text is required.`
    if (_.isEmpty(parts) && !prompt) {
        return {
            status: false,
            text: ``,
            error,
        }
    }

    let inputParts: Part[]
    if (!parts || _.isEmpty(parts)) {
        inputParts = [
            {
                text: prompt || ``,
            },
        ]
    } else {
        inputParts = parts
    }
    const hasImage = _.some(inputParts, part => {
        return part?.inlineData?.data && part?.inlineData?.mimeType
    })

    let params: Partial<IGeminiContentProps> & { contents: [{ role: Roles; parts: Part[] }] } = {
        generationConfig: {
            ...defaultGenerationConfig,
            ...generationConfig,
        },
        safetySettings: _.isEmpty(safetySettings)
            ? defaultSafetySettings
            : _.map(defaultSafetySettings, ss => {
                  const category = ss.category
                  const newSS = _.find(safetySettings, category)
                  return {
                      ...ss,
                      threshold: newSS?.threshold || ss.threshold,
                  }
              }),
        contents: [{ role: Roles.user, parts: inputParts }],
    }

    try {
        const result = hasImage ? await modelProVision.generateContent(params) : await model.generateContent(params)
        const { totalTokens } = await modelProVision.countTokens(inputParts)
        const response = result.response
        return {
            status: true,
            text: response.text(),
            totalTokens,
        }
    } catch (e) {
        console.log(`GeminiChat error`, e)
        error = String(e)
    }

    return {
        status: false,
        text: ``,
        error,
    }
}

export const GeminiTokenCount = async ({ prompt, parts, history, limit }: IGeminiTokenCountProps) => {
    let totalTokens = 0,
        validIndex = 0,
        countTokensResult

    if (!prompt && !parts?.length && !history?.length) {
        return { totalTokens }
    }

    if (parts?.length) {
        countTokensResult = await model.countTokens(parts)
        if (limit && limit > 0 && countTokensResult?.totalTokens > limit) {
            let currentTokens = countTokensResult.totalTokens
            let start = 0
            const partsLength = parts.length
            while (currentTokens > limit && start < partsLength) {
                start++
                currentTokens = (await model.countTokens(parts.slice(start)))?.totalTokens || 0
            }
            validIndex = start
        }
    } else if (prompt) {
        countTokensResult = await model.countTokens(prompt)
    } else if (history && !_.isEmpty(history)) {
        countTokensResult = await model.countTokens({
            contents: [...history],
        })
        if (limit && limit > 0 && countTokensResult?.totalTokens > limit) {
            let currentTokens = countTokensResult.totalTokens
            let start = 0
            const historyLength = history.length
            while (currentTokens > limit && start < historyLength) {
                start++
                currentTokens =
                    (
                        await model.countTokens({
                            contents: history.slice(start),
                        })
                    )?.totalTokens || 0
            }
            validIndex = start
        }
    }

    totalTokens = countTokensResult?.totalTokens || totalTokens

    return { totalTokens, validIndex }
}
