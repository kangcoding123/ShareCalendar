// app/(tabs)/community/index.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { Post } from '@/types/board';
import { COMMUNITY_GROUP_ID, isAdmin } from '@/services/communityService';
import { updateBoardLastViewed } from '@/services/boardService';
import { nativeDb } from '@/config/firebase';
import PostItem from '@/components/board/PostItem';

export default function CommunityScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  const { user } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userIsAdmin = user?.uid ? isAdmin(user.uid) : false;

  // 실시간 리스너
  useEffect(() => {
    const unsubscribe = nativeDb
      .collection('posts')
      .where('groupId', '==', COMMUNITY_GROUP_ID)
      .onSnapshot(
        (snapshot) => {
          const allPosts: Post[] = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          } as Post));

          // 고정글 우선, 그 다음 최신순
          allPosts.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            if (a.isPinned && b.isPinned) {
              return new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime();
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          setPosts(allPosts);
          setLoading(false);
          setRefreshing(false);
        },
        (error) => {
          console.error('[Community] 게시글 실시간 리스너 오류:', error);
          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, []);

  // 뒤로가기 처리
  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        router.back();
        return true;
      });

      return () => {
        // 나갈 때 마지막 조회 시간 업데이트
        if (user?.uid) {
          updateBoardLastViewed(user.uid, COMMUNITY_GROUP_ID);
        }
        backHandler.remove();
      };
    }, [user?.uid, router])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const handlePostPress = (post: Post) => {
    router.push({
      pathname: '/(tabs)/community/[postId]',
      params: {
        postId: post.id,
        isAdmin: userIsAdmin ? 'true' : 'false',
        postData: JSON.stringify(post),
      }
    });
  };

  const handleCreatePost = () => {
    router.push('/(tabs)/community/create');
  };

  const handleGoBack = () => {
    router.back();
  };

  const pinnedPosts = posts.filter(p => p.isPinned);
  const regularPosts = posts.filter(p => !p.isPinned);

  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.lightGray }]}>{title}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Feather name="chevron-left" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>커뮤니티</Text>
        {user ? (
          <TouchableOpacity onPress={handleCreatePost} style={styles.createButton}>
            <Feather name="edit-3" size={22} color={colors.tint} />
          </TouchableOpacity>
        ) : (
          <View style={styles.createButton} />
        )}
      </View>

      {!user ? (
        <View style={styles.emptyContainer}>
          <Feather name="message-square" size={48} color={colors.lightGray} />
          <Text style={[styles.emptyText, { color: colors.text, marginTop: 16 }]}>
            로그인이 필요합니다
          </Text>
          <TouchableOpacity
            style={[styles.createFirstButton, { backgroundColor: colors.tint }]}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.createFirstButtonText}>로그인</Text>
          </TouchableOpacity>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconContainer, { backgroundColor: colors.border + '40' }]}>
            <Feather name="message-circle" size={32} color={colors.lightGray} />
          </View>
          <Text style={[styles.emptyText, { color: colors.text }]}>
            아직 게시글이 없습니다
          </Text>
          <Text style={[styles.emptySubText, { color: colors.lightGray }]}>
            첫 번째 게시글을 작성해보세요
          </Text>
          <TouchableOpacity
            style={[styles.createFirstButton, { backgroundColor: colors.tint }]}
            onPress={handleCreatePost}
            activeOpacity={0.8}
          >
            <Text style={styles.createFirstButtonText}>글쓰기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={
            <>
              {pinnedPosts.length > 0 && (
                <>
                  {renderSectionHeader('공지')}
                  {pinnedPosts.map(post => (
                    <PostItem
                      key={post.id}
                      post={post}
                      onPress={() => handlePostPress(post)}
                      colors={colors}
                    />
                  ))}
                </>
              )}
              {regularPosts.length > 0 && (
                <>
                  {pinnedPosts.length > 0 && renderSectionHeader('게시글')}
                  {regularPosts.map(post => (
                    <PostItem
                      key={post.id}
                      post={post}
                      onPress={() => handlePostPress(post)}
                      colors={colors}
                    />
                  ))}
                </>
              )}
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.tint}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButton: {
    padding: 4,
    marginLeft: -4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
    letterSpacing: -0.3,
  },
  createButton: {
    padding: 8,
    width: 38,
  },
  listContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  emptySubText: {
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  createFirstButton: {
    marginTop: 28,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 25,
  },
  createFirstButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
