import { lazy, Suspense, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { campusAPI, getFirebaseAuth } from '../lib/firebase'
import { campusDestination, initials, navigate } from '../lib/community'
import SignInForm from './SignInForm'
import CampusIllustration from './CampusIllustration'
import ProfilePage from './ProfilePage'
import PeoplePage from './PeoplePage'
import CrowdDesk from './CrowdDesk'
import AccessPortal from './AccessPortal'
import './community.css'
const Campus = lazy(() => import('../App'))
interface Access {
  id: string
  name: string
  role: 'member' | 'moderator' | 'admin'
  status: string
}
function Landing({
  signedIn,
  onEnter,
}: {
  signedIn: boolean
  onEnter: () => void
}) {
  return (
    <main>
      <section className="community-hero community-container">
        <div className="hero-copy">
          <div className="hero-badge">
            <span /> A little closer to campus
          </div>
          <h1>
            Same campus.
            <br />A whole new
            <br />
            <em>way to belong.</em>
          </h1>
          <p className="hero-description">
            Take the familiar roads. Meet at the ground.
            <br className="desktop-break" /> Give the OAT a night to remember.
          </p>
          {signedIn ? (
            <div className="hero-return">
              <button className="community-primary" onClick={onEnter}>
                Step into campus <span>↗</span>
              </button>
              <p>Your people. Your places. All right here.</p>
            </div>
          ) : (
            <div id="join">
              <SignInForm destination={window.location.search ? undefined : '/student'} />
              <button className="access-switch" onClick={() => navigate('/admin')}>Campus owner? Admin entrance ↗</button>
            </div>
          )}
        </div>
        <div className="hero-world">
          <span className="world-coordinate">15.1677° N &nbsp; 74.0155° E</span>
          <CampusIllustration />
          <div className="world-caption">
            <span className="world-label">NIT GOA, IN A NEW DIMENSION</span>
            <span>Built around the places we know.</span>
          </div>
        </div>
      </section>
      <section
        className="community-features community-container"
        id="experiences"
      >
        <div className="feature-heading">
          <span className="community-kicker">MORE THAN A MAP</span>
          <h2>
            The best bits happen
            <br />
            when we’re together.
          </h2>
          <p>
            A place to explore, play, perform
            <br />
            and make a little space of your own.
          </p>
        </div>
        <div className="feature-grid">
          <article>
            <span className="feature-icon">↗</span>
            <span className="feature-number">01 / WANDER</span>
            <h3>Know every corner.</h3>
            <p>
              Walk the campus in 3D. Find your next class, your favourite stop,
              or somewhere new.
            </p>
          </article>
          <article className="feature-dark">
            <span className="feature-icon">♫</span>
            <span className="feature-number">02 / TAKE THE STAGE</span>
            <h3>Your OAT. Your encore.</h3>
            <p>
              Gather an audience, share a track, and sing live. Or settle into
              the seats and listen.
            </p>
          </article>
          <article>
            <span className="feature-icon">◉</span>
            <span className="feature-number">03 / FIND YOUR TEAM</span>
            <h3>A quick game, anyone?</h3>
            <p>
              Head to the sports ground. One shared ball, two teams, and whoever
              turns up.
            </p>
          </article>
        </div>
      </section>
      <section className="community-profile-promo community-container">
        <div className="promo-art" aria-hidden="true">
          <div className="promo-orbit" />
          <div className="promo-avatar">YOU</div>
          <span className="promo-tag tag-one">Your story</span>
          <span className="promo-tag tag-two">Your kind of people</span>
          <span className="promo-tag tag-three">Your campus</span>
        </div>
        <div>
          <span className="community-kicker">COME AS YOU ARE</span>
          <h2>
            A profile that
            <br />
            feels like <em>you.</em>
          </h2>
          <p>
            A bio, a few interests, your favourite colour.
            <br />
            Make it yours whenever you feel like it.
            <br />
            Keep it private or share it with the campus.
          </p>
          <button
            className="community-secondary"
            onClick={() =>
              signedIn
                ? navigate('/me')
                : document
                    .getElementById('join')
                    ?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            {signedIn ? 'Make it yours' : 'Join first. Make it yours later.'} ↗
          </button>
        </div>
      </section>
      <footer className="community-footer community-container">
        <span>
          NITG <b>Explored</b>
        </span>
        <p>
          An independent campus experience.
          <br />
          Made for the people who make this place.
        </p>
        <button onClick={() => navigate('/people')}>
          Meet the community ↗
        </button>
      </footer>
    </main>
  )
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
  if (inCampus)
    return (
      <Suspense
        fallback={
          <div className="campus-loading">
            <span className="loading-dot" />
            <p>Taking you to campus…</p>
          </div>
        }
      >
        <Campus
          accountControl={accountControl}
          accountOpen={menu}
          canEdit={(path === '/admin/campus' && isAdmin) || (preview && import.meta.env.DEV && !auth.configured)}
        />
      </Suspense>
    )
  return (
    <div className="community-shell">
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
          <span className="brand-mark" aria-hidden="true">
            ✳
          </span>
          <span>
            NITG <b>Explored</b>
            <small>A CAMPUS, CONNECTED.</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/student" onClick={(e) => { e.preventDefault(); navigate('/student') }}>Student space</a>
          <a
            href="/people"
            onClick={(e) => {
              e.preventDefault()
              navigate('/people')
            }}
          >
            The people
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
          {(!signedIn || isAdmin) && (
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
                Enter campus ↗
              </button>
            </>
          ) : (
            <button
              className="community-secondary"
              onClick={() => {
                navigate(adminPage ? '/admin' : '/student')
              }}
            >
              Come on in ↗
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
                onSaved={() => setRefresh((v) => v + 1)}
              />
            ) : (path === '/manage' || path === '/admin/crowd') && isAdmin ? (
              <CrowdDesk role={access!.role} />
            ) : path === '/people' || handle ? (
              <PeoplePage handle={handle} />
            ) : (path === '/campus' && !signedIn) ||
              (memberPage && !signedIn) ? (
              <div className="community-container entry-page">
                <span className="community-kicker">YOU’RE ALMOST HERE</span>
                <h1>
                  Campus starts
                  <br />
                  with a hello.
                </h1>
                <p>
                  Sign in to join the campus. A concert or game invitation will
                  be waiting when you return.
                </p>
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
              <Landing signedIn={signedIn} onEnter={() => navigate(window.location.search ? campusDestination() : '/student')} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
