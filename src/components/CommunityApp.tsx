import { lazy, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { campusAPI, getFirebaseAuth } from '../lib/firebase'
import { campusDestination, initials, navigate } from '../lib/community'
import SignInForm from './SignInForm'
import LandingPage from './LandingPage'
import NitGoaLogo from './NitGoaLogo'
import ProfilePage from './ProfilePage'
import PeoplePage from './PeoplePage'
import CrowdDesk from './CrowdDesk'
import AccessPortal from './AccessPortal'
import AvatarChoice from './AvatarChoice'
import CampusLoadingBoundary from './CampusLoadingBoundary'
import { isAvatarStyle } from '../lib/profile'
import { trackPageView } from '../lib/analytics'
import type { AvatarStyle } from '../lib/profile'
import './community.css'
const Campus = lazy(() => import('../App'))
interface Access {
  avatarStyle?: AvatarStyle | null
  id: string
  name: string
  role: 'member' | 'moderator' | 'admin'
  status: string
}
export default function CommunityApp() {
  const auth = useAuth(),
    [path, setPath] = useState(window.location.pathname),
    [access, setAccess] = useState<Access | null>(null),
    [accessLoading, setAccessLoading] = useState(false),
    [accessError, setAccessError] = useState(''),
    [refresh, setRefresh] = useState(0),
    [menu, setMenu] = useState(false),
    [preview, setPreview] = useState(false)
  useEffect(() => { trackPageView(path) }, [path])
  useEffect(() => {
    const changed = () => {
      setPath(window.location.pathname)
      setMenu(false)
      setPreview(false)
      document.querySelector('.community-shell')?.scrollTo(0, 0)
    }
    window.addEventListener('popstate', changed)
    return () => window.removeEventListener('popstate', changed)
  }, [])
  useEffect(() => {
    let active = true
    setAccessError('')
    if (!auth.user) {
      setAccess(null)
      setAccessLoading(false)
      return
    }
    if (!auth.user.email_confirmed_at) {
      setAccess(null)
      setAccessLoading(false)
      setAccessError('Verify your email before entering campus.')
      return
    }
    setAccessLoading(!access)
    void campusAPI('/api/access')
      .then((data) => {
        const error = !data || data.status !== 'active'
        if (active) {
          if (error || !data) {
            setAccess(null)
            setAccessError(
              data?.error ||
                'Your campus account could not be opened. Try again, or contact the campus host.',
            )
          } else if (data.status !== 'active') {
            setAccess(null)
            setAccessError(
              'Access to this campus has been suspended. Contact the campus host.',
            )
          } else setAccess(data as Access)
          setAccessLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setAccess(null)
          setAccessError('Your campus account is temporarily unavailable.')
          setAccessLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [auth.user?.id, refresh])
  useEffect(() => {
    if (!auth.user) return
    const timer = window.setInterval(
      () => setRefresh((value) => value + 1),
      60000,
    )
    return () => window.clearInterval(timer)
  }, [auth.user?.id])
  const signedIn = !!access && access.id === auth.user?.id && !accessLoading,
    isAdmin = signedIn && access?.role === 'admin',
    adminPage = ['/admin', '/admin/campus', '/admin/crowd', '/manage'].includes(path),
    inCampus = (path === '/campus' && (signedIn || preview)) || (path === '/admin/campus' && isAdmin),
    memberPage = path === '/me',
    handle = path.startsWith('/people/') ? path.slice(8) : undefined
  const enter = () => {
    navigate(campusDestination())
    setPreview(false)
  }
  const signOut = async (destination = '/') => {
    setAccess(null)
    setMenu(false)
    navigate(destination)
    try {
      const [auth, sdk] = await Promise.all([
        getFirebaseAuth(),
        import('firebase/auth'),
      ])
      await sdk.signOut(auth)
    } catch {
      setAccessError('Sign-out could not complete.')
    }
  }
  useEffect(() => {
    if (!menu) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false)
    }
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest('.campus-account')
      )
        setMenu(false)
    }
    window.addEventListener('keydown', close)
    window.addEventListener('pointerdown', outside)
    return () => {
      window.removeEventListener('keydown', close)
      window.removeEventListener('pointerdown', outside)
    }
  }, [menu])
  const accountControl = (
    <div className="campus-account">
      <button
        className="campus-account-trigger"
        aria-expanded={menu}
        onClick={() => setMenu((v) => !v)}
      >
        <span>{initials(access?.name || 'Preview')}</span>
        <span className="campus-account-name">
          {preview ? 'Preview' : access?.name || 'My account'}
        </span>{' '}
        <span aria-hidden="true">⌄</span>
      </button>
      {menu && (
        <nav className="campus-account-menu" aria-label="Account">
          <button onClick={() => navigate('/student')}>Student space ↗</button>
          <button onClick={() => navigate('/me')}>My profile ↗</button>
          <button onClick={() => navigate('/people')}>
            Meet the community
          </button>
          {isAdmin && (
            <button onClick={() => navigate('/admin')}>Admin space ↗</button>
          )}
          <button onClick={() => navigate('/')}>Back to welcome</button>
          {signedIn && <button onClick={() => void signOut()}>Sign out</button>}
        </nav>
      )}
    </div>
  )
  if (inCampus && signedIn && !isAvatarStyle(access?.avatarStyle)) return <AvatarChoice key={access!.id} onBack={() => navigate('/student')} onSaved={style => { setAccess(previous => previous && previous.id === auth.user?.id ? { ...previous, avatarStyle: style } : previous); setRefresh(value => value + 1) }} />
  if (inCampus)
    return (
      <CampusLoadingBoundary>
        <Campus
          avatarStyle={access?.avatarStyle ?? undefined}
          accountControl={accountControl}
          accountOpen={menu}
          canEdit={(path === '/admin/campus' && isAdmin) || (preview && import.meta.env.DEV && !auth.configured)}
        />
      </CampusLoadingBoundary>
    )
  return (
    <div className={`community-shell ${path === '/' ? 'welcome-shell' : ''}`}>
      <a className="community-skip" href="#community-content">
        Skip to content
      </a>
      <header className="community-header community-container">
        <a
          className="community-brand"
          href="/"
          onClick={(e) => {
            e.preventDefault()
            navigate('/')
          }}
        >
          <NitGoaLogo />
          <span>
            NITG <b>Explored</b>
            <small>NIT GOA · CUNCOLIM</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {path === '/' ? <a href="#experiences">Experiences</a> : <a href="/student" onClick={(e) => { e.preventDefault(); navigate('/student') }}>Student space</a>}
          <a
            href="/people"
            onClick={(e) => {
              e.preventDefault()
              navigate('/people')
            }}
          >
            Community
          </a>
          {signedIn && (
            <a
              href="/me"
              onClick={(e) => {
                e.preventDefault()
                navigate('/me')
              }}
            >
              My profile
            </a>
          )}
          {((path !== '/' && !signedIn) || isAdmin) && (
            <a
              href="/admin"
              onClick={(e) => {
                e.preventDefault()
                navigate('/admin')
              }}
            >
              Admin space
            </a>
          )}
        </nav>
        <div className="community-header-actions">
          {signedIn ? (
            <>
              <button
                className="community-signout"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
              <button className="community-primary" onClick={enter}>
                {path === '/' ? 'Enter ↗' : 'Enter campus ↗'}
              </button>
            </>
          ) : (
            <button
              className="community-secondary"
              onClick={() => {
                if (path === '/') document.getElementById('join')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
                else navigate(adminPage ? '/admin' : '/student')
              }}
            >
              {path === '/' ? 'Join ↗' : 'Enter campus ↗'}
            </button>
          )}
        </div>
      </header>
      <div id="community-content">
        {auth.loading || accessLoading ? (
          <div className="community-empty" role="status">
            Verifying your campus account…
          </div>
        ) : (
          <>
            {(auth.error || accessError) && (
              <div
                className="community-container community-access-error"
                role="alert"
              >
                <p>{accessError || auth.error}</p>
                {auth.user && (
                  <>
                    <button
                      className="community-secondary"
                      onClick={() => setRefresh((v) => v + 1)}
                    >
                      Try again
                    </button>
                    <button
                      className="community-secondary"
                      onClick={() => void signOut()}
                    >
                      Sign out
                    </button>
                  </>
                )}
              </div>
            )}
            {(adminPage && (!isAdmin || path === '/admin')) || path === '/student' ? (
              <AccessPortal admin={adminPage} signedIn={signedIn} isAdmin={isAdmin} name={access?.name || 'Campus member'} onSwitchAccount={() => void signOut('/admin')} />
            ) : path === '/me' && signedIn ? (
              <ProfilePage
                userId={access!.id}
                onSaved={profile => { setAccess(previous => previous && previous.id === profile.id ? { ...previous, avatarStyle: profile.avatar_style ?? null, name: profile.display_name } : previous); setRefresh((v) => v + 1) }}
              />
            ) : (path === '/manage' || path === '/admin/crowd') && isAdmin ? (
              <CrowdDesk role={access!.role} />
            ) : path === '/people' || handle ? (
              <PeoplePage handle={handle} />
            ) : (path === '/campus' && !signedIn) ||
              (memberPage && !signedIn) ? (
              <div className="community-container entry-page">
                <span className="community-kicker">NIT GOA, TOGETHER</span>
                <h1>Step into campus.</h1>
                <p>Sign in with Google to join.</p>
                <SignInForm />
                {import.meta.env.DEV && !auth.configured && (
                  <button
                    className="community-secondary dev-preview"
                    onClick={() => {
                      navigate('/campus')
                      setPreview(true)
                    }}
                  >
                    Local campus preview
                  </button>
                )}
              </div>
            ) : (
              <LandingPage signedIn={signedIn} onEnter={enter} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
