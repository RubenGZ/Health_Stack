import { useState, useEffect, useCallback } from 'react'
import { Heart, Plus, Loader2, RefreshCw, Send, X, MessageCircle } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { PageContainer, ScrollArea } from '@/components/layout/PageContainer'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/services/api'

/* ── Types ──────────────────────────────────────────────────── */
interface PostResponse {
  id: string
  display_name: string | null
  content: string
  likes_count: number
  created_at: string
  liked_by_me: boolean
}

interface PostListResponse {
  posts: PostResponse[]
  total: number
}

/* ── Helpers ────────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)  return 'ahora mismo'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  return `hace ${Math.floor(diff / 86400)} d`
}

function initials(name: string | null, email?: string | null): string {
  const n = name ?? email?.split('@')[0] ?? '?'
  return n.slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  'from-cyan-500 to-teal-400',
  'from-violet-500 to-purple-400',
  'from-orange-500 to-amber-400',
  'from-pink-500 to-rose-400',
  'from-emerald-500 to-green-400',
]

function avatarColor(name: string | null): string {
  const seed = (name ?? 'x').charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[seed]
}

/* ── PostCard ───────────────────────────────────────────────── */
function PostCard({
  post,
  onLike,
  isLiking,
}: {
  post: PostResponse
  onLike: (id: string) => void
  isLiking: boolean
}) {
  const name = post.display_name ?? 'Atleta'

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avatarColor(post.display_name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}
        >
          {initials(post.display_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{name}</p>
          <p className="text-[11px] text-zinc-500">{timeAgo(post.created_at)}</p>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-zinc-300 leading-relaxed break-words">{post.content}</p>

      {/* Actions */}
      <div className="flex items-center gap-4 pt-1 border-t border-zinc-800">
        <button
          onClick={() => onLike(post.id)}
          disabled={isLiking}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors min-h-[36px] px-1 ${
            post.liked_by_me
              ? 'text-rose-400'
              : 'text-zinc-500 hover:text-rose-400'
          }`}
        >
          <Heart
            className={`w-4 h-4 transition-all ${post.liked_by_me ? 'fill-rose-400' : ''}`}
          />
          <span>{post.likes_count}</span>
        </button>

        <div className="flex items-center gap-1.5 text-xs text-zinc-600">
          <MessageCircle className="w-4 h-4" />
          <span>Comunidad</span>
        </div>
      </div>
    </div>
  )
}

/* ── CreatePostSheet ────────────────────────────────────────── */
function CreatePostSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (post: PostResponse) => void
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const maxLen = 280

  async function handleSubmit() {
    const trimmed = content.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const post = await api.post<PostResponse>('/api/v1/community/posts', { content: trimmed })
      onCreated(post)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al publicar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 rounded-t-3xl p-6 pb-safe flex flex-col gap-4 max-h-[75vh]">
        {/* Handle */}
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto -mt-2 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Nueva publicación</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Text area */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value.slice(0, maxLen))}
          placeholder="¿Qué quieres compartir con la comunidad?"
          rows={4}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-cyan-500 transition-colors scrollable"
          autoFocus
        />

        {/* Counter + error */}
        <div className="flex items-center justify-between -mt-1">
          <span className={`text-xs ${content.length >= maxLen ? 'text-red-400' : 'text-zinc-600'}`}>
            {content.length}/{maxLen}
          </span>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !content.trim()}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:pointer-events-none rounded-xl text-sm font-bold text-black transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Publicar
        </button>
      </div>
    </>
  )
}

/* ── Main screen ────────────────────────────────────────────── */
export function CommunityScreen() {
  const user = useAuthStore(s => s.user)

  const [posts, setPosts] = useState<PostResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set())

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<PostListResponse>('/api/v1/community/posts?limit=30&offset=0')
      setPosts(data.posts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar posts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  async function handleLike(postId: string) {
    if (!user) return
    if (likingIds.has(postId)) return

    setLikingIds(prev => new Set(prev).add(postId))

    // Optimistic update
    setPosts(prev =>
      prev.map(p =>
        p.id === postId
          ? {
              ...p,
              liked_by_me: !p.liked_by_me,
              likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1,
            }
          : p
      )
    )

    try {
      await api.post<void>(`/api/v1/community/posts/${postId}/like`, {})
    } catch {
      // Revert on error
      setPosts(prev =>
        prev.map(p =>
          p.id === postId
            ? {
                ...p,
                liked_by_me: !p.liked_by_me,
                likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1,
              }
            : p
        )
      )
    } finally {
      setLikingIds(prev => { const s = new Set(prev); s.delete(postId); return s })
    }
  }

  function handleCreated(post: PostResponse) {
    setPosts(prev => [post, ...prev])
  }

  return (
    <PageContainer>
      <TopBar
        back
        title="Comunidad"
        right={
          <button
            onClick={fetchPosts}
            className="p-2 text-zinc-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Actualizar"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      <ScrollArea>
        {/* ── Empty / Error / Loading ── */}
        {loading && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            <p className="text-sm text-zinc-500">Cargando posts…</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-center">
            <p className="text-sm text-red-400 mb-3">{error}</p>
            <button
              onClick={fetchPosts}
              className="text-xs text-red-400 underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <MessageCircle className="w-10 h-10 text-zinc-700" />
            <p className="text-sm text-zinc-400 font-medium">La comunidad está esperando</p>
            <p className="text-xs text-zinc-600">¡Sé el primero en publicar algo!</p>
          </div>
        )}

        {/* ── Post feed ── */}
        {posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            onLike={handleLike}
            isLiking={likingIds.has(post.id)}
          />
        ))}

        {/* Bottom spacer for FAB */}
        <div className="h-20" />
      </ScrollArea>

      {/* ── FAB ── */}
      {user && (
        <button
          onClick={() => setShowCreate(true)}
          className="fixed bottom-20 right-4 w-14 h-14 bg-cyan-500 hover:bg-cyan-400 rounded-2xl flex items-center justify-center shadow-[0_4px_20px_rgba(8,145,178,0.45)] transition-all active:scale-95 z-30"
          aria-label="Crear publicación"
        >
          <Plus className="w-6 h-6 text-black font-bold" />
        </button>
      )}

      {/* ── Not logged in banner ── */}
      {!user && (
        <div className="mx-4 mb-4 bg-zinc-900 border border-zinc-700 rounded-2xl p-4 text-center">
          <p className="text-xs text-zinc-400">
            Inicia sesión para publicar y dar likes
          </p>
        </div>
      )}

      {/* ── Create sheet ── */}
      {showCreate && (
        <CreatePostSheet
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </PageContainer>
  )
}
