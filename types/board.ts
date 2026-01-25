// types/board.ts
// 게시판 관련 타입 정의

// 첨부파일 타입
export interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: 'image' | 'video' | 'document' | 'other';
  url: string;
  storagePath: string;
  createdAt: string;
}

// 업로드 중인 파일 상태
export interface PendingAttachment {
  id: string;
  uri: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fileType: 'image' | 'video' | 'document' | 'other';
  uploadProgress?: number;
}

export interface Post {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  title: string;
  content: string;
  isPinned: boolean;
  pinnedAt?: string;
  pinnedBy?: string;
  commentCount: number;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  groupId: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostResult {
  success: boolean;
  post?: Post;
  posts?: Post[];
  error?: string;
  postId?: string;
}

export interface CommentResult {
  success: boolean;
  comment?: Comment;
  comments?: Comment[];
  error?: string;
  commentId?: string;
}

export type CreatePostData = Omit<Post, 'id' | 'createdAt' | 'updatedAt' | 'commentCount' | 'isPinned' | 'pinnedAt' | 'pinnedBy'>;

export type CreateCommentData = Omit<Comment, 'id' | 'createdAt' | 'updatedAt'>;
