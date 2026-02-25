// services/boardService.ts
import { nativeDb } from '../config/firebase';
import { Post, Comment, PostResult, CommentResult, CreatePostData, CreateCommentData, Attachment } from '../types/board';
import { sendGroupNotification, sendUserNotification } from './notificationService';
import { deleteFiles } from './fileService';

/**
 * 그룹 관리자 여부 확인
 */
export const checkGroupOwnership = async (
  groupId: string,
  userId: string
): Promise<boolean> => {
  try {
    const snapshot = await nativeDb
      .collection('groupMembers')
      .where('groupId', '==', groupId)
      .where('userId', '==', userId)
      .where('role', '==', 'owner')
      .get();

    return !snapshot.empty;
  } catch (error) {
    console.error('[checkGroupOwnership] 오류:', error);
    return false;
  }
};

/**
 * 그룹 멤버 여부 확인
 */
export const checkGroupMembership = async (
  groupId: string,
  userId: string
): Promise<boolean> => {
  try {
    const snapshot = await nativeDb
      .collection('groupMembers')
      .where('groupId', '==', groupId)
      .where('userId', '==', userId)
      .get();

    return !snapshot.empty;
  } catch (error) {
    console.error('[checkGroupMembership] 오류:', error);
    return false;
  }
};

/**
 * 게시글 생성
 */
export const createPost = async (
  postData: CreatePostData,
  attachments?: Attachment[]
): Promise<PostResult> => {
  try {
    const now = new Date().toISOString();

    const docRef = await nativeDb.collection('posts').add({
      ...postData,
      isPinned: false,
      commentCount: 0,
      attachments: attachments || [],
      createdAt: now,
      updatedAt: now,
    });

    // 그룹 멤버들에게 푸시 알림 전송 (작성자 제외)
    try {
      await sendGroupNotification(
        postData.groupId,
        '새 게시글 📝',
        `${postData.authorName}: ${postData.title}`,
        { type: 'new_post', postId: docRef.id, groupId: postData.groupId },
        postData.authorId
      );
    } catch (notifError) {
      console.error('[createPost] 알림 전송 오류:', notifError);
    }

    return {
      success: true,
      postId: docRef.id,
      post: {
        id: docRef.id,
        ...postData,
        isPinned: false,
        commentCount: 0,
        attachments: attachments || [],
        createdAt: now,
        updatedAt: now,
      }
    };
  } catch (error: any) {
    console.error('[createPost] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 게시글 수정
 */
export const updatePost = async (
  postId: string,
  updates: Partial<Pick<Post, 'title' | 'content'>>,
  attachments?: Attachment[]
): Promise<PostResult> => {
  try {
    const updateData: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // attachments가 전달되면 업데이트
    if (attachments !== undefined) {
      updateData.attachments = attachments;
    }

    await nativeDb.collection('posts').doc(postId).update(updateData);

    return { success: true };
  } catch (error: any) {
    console.error('[updatePost] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 게시글 삭제
 */
export const deletePost = async (postId: string): Promise<PostResult> => {
  try {
    // 게시글 정보 먼저 조회 (첨부파일 삭제용)
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

    const postRef = nativeDb.collection('posts').doc(postId);
    batch.delete(postRef);

    await batch.commit();

    // 첨부파일 삭제 (Firebase Storage)
    if (postData?.attachments && postData.attachments.length > 0) {
      const storagePaths = postData.attachments.map((att: Attachment) => att.storagePath);
      try {
        await deleteFiles(storagePaths);
      } catch (storageError) {
        console.error('[deletePost] Storage 파일 삭제 오류:', storageError);
        // Storage 삭제 실패해도 게시글 삭제는 성공으로 처리
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('[deletePost] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 게시글 상세 조회
 */
export const getPostById = async (postId: string): Promise<PostResult> => {
  try {
    const doc = await nativeDb.collection('posts').doc(postId).get();

    if (!(doc as any).exists) {
      return { success: false, error: '게시글을 찾을 수 없습니다.' };
    }

    const data = doc.data();

    return {
      success: true,
      post: {
        id: doc.id,
        ...data,
      } as Post,
    };
  } catch (error: any) {
    console.error('[getPostById] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 그룹별 게시글 목록 조회 (고정글 우선)
 */
export const getPostsByGroup = async (
  groupId: string,
  options?: { limit?: number; lastCreatedAt?: string }
): Promise<PostResult> => {
  try {
    // 그룹의 모든 게시글을 가져와서 클라이언트에서 정렬 (인덱스 불필요)
    const snapshot = await nativeDb
      .collection('posts')
      .where('groupId', '==', groupId)
      .get();

    const allPosts: Post[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Post));

    // 클라이언트에서 정렬: 고정글 우선, 그 다음 최신순
    allPosts.sort((a, b) => {
      // 고정글 우선
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      // 고정글끼리는 pinnedAt 기준
      if (a.isPinned && b.isPinned) {
        return new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime();
      }

      // 일반글은 createdAt 기준 최신순
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return { success: true, posts: allPosts };
  } catch (error: any) {
    console.error('[getPostsByGroup] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 게시글 고정
 */
export const pinPost = async (
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
    console.error('[pinPost] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 게시글 고정 해제
 */
export const unpinPost = async (postId: string): Promise<PostResult> => {
  try {
    await nativeDb.collection('posts').doc(postId).update({
      isPinned: false,
      pinnedAt: null,
      pinnedBy: null,
    });

    return { success: true };
  } catch (error: any) {
    console.error('[unpinPost] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 댓글 생성
 */
export const createComment = async (commentData: CreateCommentData): Promise<CommentResult> => {
  try {
    const now = new Date().toISOString();

    const batch = nativeDb.batch();

    // 댓글 추가
    const commentRef = nativeDb.collection('comments').doc();
    batch.set(commentRef, {
      ...commentData,
      createdAt: now,
      updatedAt: now,
    });

    // 게시글의 commentCount 증가
    const postRef = nativeDb.collection('posts').doc(commentData.postId);
    const postDoc = await postRef.get();
    const postData = postDoc.data();

    if ((postDoc as any).exists && postData) {
      const currentCount = postData.commentCount || 0;
      batch.update(postRef, {
        commentCount: currentCount + 1,
      });
    }

    await batch.commit();

    // 게시글 작성자에게 푸시 알림 전송 (본인 댓글 제외)
    try {
      if (postData && postData.authorId !== commentData.authorId) {
        await sendUserNotification(
          postData.authorId,
          '새 댓글 💬',
          `${commentData.authorName}님이 댓글을 남겼습니다: "${postData.title}"`,
          { type: 'new_comment', postId: commentData.postId, groupId: commentData.groupId }
        );
      }
    } catch (notifError) {
      console.error('[createComment] 알림 전송 오류:', notifError);
    }

    return {
      success: true,
      commentId: commentRef.id,
      comment: {
        id: commentRef.id,
        ...commentData,
        createdAt: now,
        updatedAt: now,
      },
    };
  } catch (error: any) {
    console.error('[createComment] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 댓글 수정
 */
export const updateComment = async (
  commentId: string,
  content: string
): Promise<CommentResult> => {
  try {
    await nativeDb.collection('comments').doc(commentId).update({
      content,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('[updateComment] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 댓글 삭제
 */
export const deleteComment = async (
  commentId: string,
  postId: string
): Promise<CommentResult> => {
  try {
    const batch = nativeDb.batch();

    // 댓글 삭제
    const commentRef = nativeDb.collection('comments').doc(commentId);
    batch.delete(commentRef);

    // 게시글의 commentCount 감소
    const postRef = nativeDb.collection('posts').doc(postId);
    const postDoc = await postRef.get();

    if ((postDoc as any).exists) {
      const currentCount = postDoc.data()?.commentCount || 0;
      if (currentCount > 0) {
        batch.update(postRef, {
          commentCount: currentCount - 1,
        });
      }
    }

    await batch.commit();

    return { success: true };
  } catch (error: any) {
    console.error('[deleteComment] 오류:', error);
    return { success: false, error: error.message };
  }
};

/**
 * 게시글별 댓글 목록 조회
 */
export const getCommentsByPost = async (postId: string): Promise<CommentResult> => {
  try {
    // 인덱스 없이 조회 후 클라이언트에서 정렬
    const snapshot = await nativeDb
      .collection('comments')
      .where('postId', '==', postId)
      .get();

    const comments: Comment[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Comment));

    // 작성 시간순 정렬 (오래된 것 먼저)
    comments.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return { success: true, comments };
  } catch (error: any) {
    console.error('[getCommentsByPost] 오류:', error);
    return { success: false, error: error.message };
  }
};

// ============================================
// 게시판 알림 배지 관련 함수
// ============================================

/**
 * 게시판 마지막 조회 시간 업데이트
 */
export const updateBoardLastViewed = async (
  userId: string,
  groupId: string
): Promise<void> => {
  try {
    const userRef = nativeDb.collection('users').doc(userId);
    await userRef.update({
      [`boardLastViewedAt.${groupId}`]: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[updateBoardLastViewed] 오류:', error);
  }
};

/**
 * 사용자의 그룹별 마지막 조회 시간 가져오기
 */
export const getBoardLastViewedAt = async (
  userId: string
): Promise<{ [groupId: string]: string }> => {
  try {
    const userDoc = await nativeDb.collection('users').doc(userId).get();
    if (!(userDoc as any).exists) {
      return {};
    }
    return userDoc.data()?.boardLastViewedAt || {};
  } catch (error) {
    console.error('[getBoardLastViewedAt] 오류:', error);
    return {};
  }
};

/**
 * 전체 그룹 중 새 게시글 있는지 확인
 * (본인이 작성한 게시글은 제외)
 */
export const hasAnyUnreadPosts = async (
  userId: string,
  groupIds: string[]
): Promise<boolean> => {
  try {
    if (groupIds.length === 0) return false;

    // 사용자의 마지막 조회 시간 가져오기
    const lastViewedAt = await getBoardLastViewedAt(userId);

    // 각 그룹에 대해 새 게시글 확인
    for (const groupId of groupIds) {
      const lastViewed = lastViewedAt[groupId];

      // 방문한 적 없는 그룹은 게시글이 있으면 unread로 처리
      const snapshot = await nativeDb
        .collection('posts')
        .where('groupId', '==', groupId)
        .get();

      if (snapshot.empty) continue;

      // 마지막 조회 시간 이후의 게시글이 있는지 확인 (본인 글 제외)
      const hasNewPost = snapshot.docs.some(doc => {
        const data = doc.data();
        // 본인이 작성한 글은 제외
        if (data.authorId === userId) return false;
        const postCreatedAt = data.createdAt;
        if (!lastViewed) return true; // 방문한 적 없으면 새 글로 처리
        return new Date(postCreatedAt) > new Date(lastViewed);
      });

      if (hasNewPost) return true;
    }

    return false;
  } catch (error) {
    console.error('[hasAnyUnreadPosts] 오류:', error);
    return false;
  }
};

/**
 * 그룹별 읽지 않은 게시글 수 가져오기
 * (본인이 작성한 게시글은 제외)
 */
export const getUnreadPostCounts = async (
  userId: string,
  groupIds: string[]
): Promise<{ [groupId: string]: number }> => {
  try {
    if (groupIds.length === 0) return {};

    // 마지막 조회 시간과 모든 posts를 병렬로 가져오기
    // Firestore 'in' 쿼리는 최대 30개까지 지원
    const chunks: string[][] = [];
    for (let i = 0; i < groupIds.length; i += 30) {
      chunks.push(groupIds.slice(i, i + 30));
    }

    const [lastViewedAt, ...snapshots] = await Promise.all([
      getBoardLastViewedAt(userId),
      ...chunks.map(chunk =>
        nativeDb.collection('posts').where('groupId', 'in', chunk).get()
      ),
    ]);

    const counts: { [groupId: string]: number } = {};
    // 초기값 설정
    for (const groupId of groupIds) {
      counts[groupId] = 0;
    }

    // 모든 posts를 한번에 처리
    for (const snapshot of snapshots) {
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const groupId = data.groupId;
        if (data.authorId === userId) continue;
        const lastViewed = lastViewedAt[groupId];
        if (!lastViewed || new Date(data.createdAt) > new Date(lastViewed)) {
          counts[groupId] = (counts[groupId] || 0) + 1;
        }
      }
    }

    return counts;
  } catch (error) {
    console.error('[getUnreadPostCounts] 오류:', error);
    return {};
  }
};

// ============================================
// 댓글 알림 배지 관련 함수
// ============================================

/**
 * 게시글 마지막 조회 시간 업데이트 (댓글 읽음 처리용)
 */
export const updatePostLastViewed = async (
  userId: string,
  postId: string
): Promise<void> => {
  try {
    const userRef = nativeDb.collection('users').doc(userId);
    await userRef.update({
      [`postLastViewedAt.${postId}`]: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[updatePostLastViewed] 오류:', error);
  }
};

/**
 * 사용자의 게시글별 마지막 조회 시간 가져오기
 */
export const getPostLastViewedAt = async (
  userId: string
): Promise<{ [postId: string]: string }> => {
  try {
    const userDoc = await nativeDb.collection('users').doc(userId).get();
    if (!(userDoc as any).exists) {
      return {};
    }
    return userDoc.data()?.postLastViewedAt || {};
  } catch (error) {
    console.error('[getPostLastViewedAt] 오류:', error);
    return {};
  }
};

/**
 * 그룹의 모든 게시글에 새 댓글이 있는지 확인
 * (본인이 작성한 댓글은 제외)
 */
export const hasAnyUnreadComments = async (
  userId: string,
  groupIds: string[]
): Promise<boolean> => {
  try {
    if (groupIds.length === 0) return false;

    // 사용자의 게시글별 마지막 조회 시간 가져오기
    const postLastViewedAt = await getPostLastViewedAt(userId);

    // 모든 그룹을 병렬 조회
    const results = await Promise.all(groupIds.map(async (groupId) => {
      const [postsSnapshot, commentsSnapshot] = await Promise.all([
        nativeDb.collection('posts').where('groupId', '==', groupId).get(),
        nativeDb.collection('comments').where('groupId', '==', groupId).get(),
      ]);

      if (postsSnapshot.empty || commentsSnapshot.empty) return false;

      const postIds = new Set(postsSnapshot.docs.map(doc => doc.id));

      return commentsSnapshot.docs.some(commentDoc => {
        const commentData = commentDoc.data();
        if (!postIds.has(commentData.postId)) return false;
        if (commentData.authorId === userId) return false;
        const lastViewed = postLastViewedAt[commentData.postId];
        if (!lastViewed) return true;
        return new Date(commentData.createdAt) > new Date(lastViewed);
      });
    }));

    return results.some(r => r);
  } catch (error) {
    console.error('[hasAnyUnreadComments] 오류:', error);
    return false;
  }
};

/**
 * 그룹별 읽지 않은 댓글 수 가져오기 (그룹 선택 모달용)
 * (본인이 작성한 댓글은 제외)
 */
export const getUnreadCommentCountsByGroup = async (
  userId: string,
  groupIds: string[]
): Promise<{ [groupId: string]: number }> => {
  try {
    if (groupIds.length === 0) return {};

    // 사용자의 게시글별 마지막 조회 시간 가져오기
    const postLastViewedAt = await getPostLastViewedAt(userId);
    const counts: { [groupId: string]: number } = {};

    // 각 그룹별로 게시글 + 댓글을 병렬 조회 (N+1 제거)
    await Promise.all(groupIds.map(async (groupId) => {
      const [postsSnapshot, commentsSnapshot] = await Promise.all([
        nativeDb.collection('posts').where('groupId', '==', groupId).get(),
        nativeDb.collection('comments').where('groupId', '==', groupId).get(),
      ]);

      if (postsSnapshot.empty) {
        counts[groupId] = 0;
        return;
      }

      const postIds = new Set(postsSnapshot.docs.map(doc => doc.id));
      let groupUnreadCount = 0;

      for (const commentDoc of commentsSnapshot.docs) {
        const commentData = commentDoc.data();
        if (!postIds.has(commentData.postId)) continue;
        if (commentData.authorId === userId) continue;
        const lastViewed = postLastViewedAt[commentData.postId];
        if (!lastViewed || new Date(commentData.createdAt) > new Date(lastViewed)) {
          groupUnreadCount++;
        }
      }

      counts[groupId] = groupUnreadCount;
    }));

    return counts;
  } catch (error) {
    console.error('[getUnreadCommentCountsByGroup] 오류:', error);
    return {};
  }
};

/**
 * 그룹의 모든 게시글별 읽지 않은 댓글 수 가져오기
 * (본인이 작성한 댓글은 제외)
 */
export const getUnreadCommentCounts = async (
  userId: string,
  groupIds: string[]
): Promise<{ [postId: string]: number }> => {
  try {
    if (groupIds.length === 0) return {};

    // 사용자의 게시글별 마지막 조회 시간 가져오기
    const postLastViewedAt = await getPostLastViewedAt(userId);
    const counts: { [postId: string]: number } = {};

    // 각 그룹별로 게시글 + 댓글을 병렬 조회 (N+1 제거)
    await Promise.all(groupIds.map(async (groupId) => {
      // 게시글과 댓글을 동시에 조회
      const [postsSnapshot, commentsSnapshot] = await Promise.all([
        nativeDb.collection('posts').where('groupId', '==', groupId).get(),
        nativeDb.collection('comments').where('groupId', '==', groupId).get(),
      ]);

      if (postsSnapshot.empty) return;

      // postId별로 게시글 목록 생성
      const postIds = new Set(postsSnapshot.docs.map(doc => doc.id));

      // 댓글을 postId별로 분류하여 읽지않음 수 계산
      for (const postId of postIds) {
        counts[postId] = 0;
      }

      for (const commentDoc of commentsSnapshot.docs) {
        const commentData = commentDoc.data();
        const postId = commentData.postId;
        if (!postIds.has(postId)) continue;
        if (commentData.authorId === userId) continue;
        const lastViewed = postLastViewedAt[postId];
        if (!lastViewed || new Date(commentData.createdAt) > new Date(lastViewed)) {
          counts[postId] = (counts[postId] || 0) + 1;
        }
      }
    }));

    return counts;
  } catch (error) {
    console.error('[getUnreadCommentCounts] 오류:', error);
    return {};
  }
};
