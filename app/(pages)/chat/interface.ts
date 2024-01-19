import { IChatItem, IImageItem } from '@/app/shared/interfaces'
import type { DBConversation } from '@/app/shared/db'
export interface IConversation
    extends Partial<
        Pick<
            DBConversation,
            | 'conversationName'
            | 'historyLimitTS'
            | 'temperature'
            | 'topK'
            | 'topP'
            | 'maxOutputTokens'
            | 'harassment'
            | 'hateSpeech'
            | 'sexuallyExplicit'
            | 'dangerousContent'
            | 'modelType'
        >
    > {
    conversationId: string
    history?: IChatItem[]
    archived?: IChatItem[]
    isSelected?: boolean
    isFetching?: boolean
    modelAvatar?: string
}

export interface ChatState {
    requestInQueueFetching: boolean
    conversationList: IConversation[]
    imageResourceList: IImageItem[]
    inputImageList: IImageItem[]
}
