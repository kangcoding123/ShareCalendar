// services/communityService.ts
// 커뮤니티 게시판 서비스 (전체 사용자 대상)
import { nativeDb } from '../config/firebase';
import { Post, Comment, PostResult, CommentResult, Attachment } from '../types/board';
import { sendUserNotification } from './notificationService';
import { deleteFiles } from './fileService';

export const COMMUNITY_GROUP_ID = 'community';

// 관리자 UID 목록
const ADMIN_UIDS = [
  'crVowfvj5jY2WzFNXSJ6UJIq6D43', // 개발자 계정 (sjkang912@naver.com)
];

/**
 * 관리자 여부 확인
 */
export const isAdmin = (userId: string): boolean => {
  return ADMIN_UIDS.includes(userId);
};

/**
 * 커뮤니티 게시글 생성
 */
export const createCommunityPost = async (
  authorId: string,
  authorName: string,
  authorEmail: string,
  title: string,
  content: string,
  attachments?: Attachment[]
): Promise<PostResult> => {
  try {
    const now = new Date().toISOString();

    const docRef = await nativeDb.collection('posts').add({
      groupId: COMMUNITY_GROUP_ID,
      authorId,
      authorName,
      authorEmail,
      title,
      content,
      isPinned: false,
      commentCount: 0,
      attachments: attachments || [],
      createdAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      postId: docRef.id,
      post: {
        id: docRef.id,
        groupId: COMMUNITY_GROUP_ID,
        authorId,
        authorName,
        authorEmail,
        title,
        content,
        isPinned: false,
        commentCount: 0,
        attachments: attachments || [],
        createdAt: now,
        updatedAt: now,
      }
    };
  } catch (error: any) {
    console.error('[createCommunityPost] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 커뮤니티 게시글 수정
 */
export const updateCommunityPost = async (
  postId: string,
  updates: Partial<Pick<Post, 'title' | 'content'>>,
  attachments?: Attachment[]
): Promise<PostResult> => {
  try {
    const updateData: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (attachments !== undefined) {
      updateData.attachments = attachments;
    }

    await nativeDb.collection('posts').doc(postId).update(updateData);
    return { success: true };
  } catch (error: any) {
    console.error('[updateCommunityPost] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 커뮤니티 게시글 삭제
 */
export const deleteCommunityPost = async (postId: string): Promise<PostResult> => {
  try {
    const postDoc = await nativeDb.collection('posts').doc(postId).get();
    const postData = postDoc.data();

    // 댓글도 함께 삭제
    const commentsSnapshot = await nativeDb
      .collection('comments')
      .where('postId', '==', postId)
      .get();

    const batch = nativeDb.batch();
    commentsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    batch.delete(nativeDb.collection('posts').doc(postId));
    await batch.commit();

    // 첨부파일 삭제
    if (postData?.attachments && postData.attachments.length > 0) {
      const storagePaths = postData.attachments.map((att: Attachment) => att.storagePath);
      try {
        await deleteFiles(storagePaths);
      } catch (storageError) {
        console.error('[deleteCommunityPost] Storage 파일 삭제 오류:', storageError);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('[deleteCommunityPost] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 커뮤니티 게시글 고정
 */
export const pinCommunityPost = async (
  postId: string,
  userId: string
): Promise<PostResult> => {
  try {
    await nativeDb.collection('posts').doc(postId).update({
      isPinned: true,
      pinnedAt: new Date().toISOString(),
      pinnedBy: userId,
    });
    return { success: true };
  } catch (error: any) {
    console.error('[pinCommunityPost] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 커뮤니티 게시글 고정 해제
 */
export const unpinCommunityPost = async (postId: string): Promise<PostResult> => {
  try {
    await nativeDb.collection('posts').doc(postId).update({
      isPinned: false,
      pinnedAt: null,
      pinnedBy: null,
    });
    return { success: true };
  } catch (error: any) {
    console.error('[unpinCommunityPost] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 커뮤니티 댓글 생성
 */
export const createCommunityComment = async (
  postId: string,
  authorId: string,
  authorName: string,
  authorEmail: string,
  content: string,
): Promise<CommentResult> => {
  try {
    const now = new Date().toISOString();
    const batch = nativeDb.batch();

    const commentRef = nativeDb.collection('comments').doc();
    batch.set(commentRef, {
      postId,
      groupId: COMMUNITY_GROUP_ID,
      authorId,
      authorName,
      authorEmail,
      content,
      createdAt: now,
      updatedAt: now,
    });

    // commentCount 증가
    const postRef = nativeDb.collection('posts').doc(postId);
    const postDoc = await postRef.get();
    const postData = postDoc.data();

    if ((postDoc as any).exists && postData) {
      batch.update(postRef, {
        commentCount: (postData.commentCount || 0) + 1,
      });
    }

    await batch.commit();

    // 게시글 작성자에게 알림 (본인 댓글 제외)
    try {
      if (postData && postData.authorId !== authorId) {
        await sendUserNotification(
          postData.authorId,
          '새 댓글 💬',
          `${authorName}님이 댓글을 남겼습니다: "${postData.title}"`,
          { type: 'new_comment', postId, groupId: COMMUNITY_GROUP_ID }
        );
      }
    } catch (notifError) {
      console.error('[createCommunityComment] 알림 전송 오류:', notifError);
    }

    return {
      success: true,
      commentId: commentRef.id,
      comment: {
        id: commentRef.id,
        postId,
        groupId: COMMUNITY_GROUP_ID,
        authorId,
        authorName,
        authorEmail,
        content,
        createdAt: now,
        updatedAt: now,
      },
    };
  } catch (error: any) {
    console.error('[createCommunityComment] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 커뮤니티 댓글 삭제
 */
export const deleteCommunityComment = async (
  commentId: string,
  postId: string
): Promise<CommentResult> => {
  try {
    const batch = nativeDb.batch();

    batch.delete(nativeDb.collection('comments').doc(commentId));

    const postRef = nativeDb.collection('posts').doc(postId);
    const postDoc = await postRef.get();

    if ((postDoc as any).exists) {
      const currentCount = postDoc.data()?.commentCount || 0;
      if (currentCount > 0) {
        batch.update(postRef, { commentCount: currentCount - 1 });
      }
    }

    await batch.commit();
    return { success: true };
  } catch (error: any) {
    console.error('[deleteCommunityComment] 오류:', error);
    return { success: false, error: error.message };
  }
};
