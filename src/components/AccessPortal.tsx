import { initials, navigate } from '../lib/community'
import SignInForm from './SignInForm'

export default function AccessPortal({
  admin, signedIn, isAdmin, name, onSwitchAccount,
}: {
  admin: boolean
  signedIn: boolean
  isAdmin: boolean
  name: string
  onSwitchAccount: () => void
}) {
  const denied = admin && signedIn && !isAdmin
  return (
    <main className="community-container access-portal">
      <div className="access-portal-heading">
        <span className="community-kicker">{admin ? 'FOR THE CAMPUS OWNER' : 'YOUR CAMPUS COMMUNITY'}</span>
        <h1>{denied ? 'Your place is in the student space.' : admin ? 'A campus in good hands.' : 'Your campus. Your people.'}</h1>
        <p>{denied
          ? 'Admin access is reserved for the campus owner. Your account can explore, play, perform and make a profile in the student space.'
          : admin
            ? 'Manage the crowd and shape the campus. Admin access belongs to one verified Google account.'
            : 'Explore familiar places, join a game or take the stage. Your profile can grow whenever you’re ready.'}</p>
      </div>
      {denied ? (
        <div className="access-portal-actions" role="status">
          <button className="community-primary" onClick={() => navigate('/student')}>Open student space ↗</button>
          <button className="community-secondary" onClick={onSwitchAccount}>Use another Google account</button>
        </div>
      ) : !signedIn ? (
        <div className="access-signin">
          <SignInForm destination={admin ? '/admin' : '/student'} />
          <button className="access-switch" onClick={() => navigate(admin ? '/student' : '/admin')}>
            {admin ? 'Looking for the student entrance? ↗' : 'Campus owner? Open the admin entrance ↗'}
          </button>
        </div>
      ) : (
        <>
          <div className="access-welcome"><span>{initials(name)}</span><p>Welcome, <strong>{name}</strong><small>{admin ? 'Campus administrator' : 'Student space'}</small></p></div>
          <div className="access-track-grid">
            {(admin ? [
              { mark: '01', title: 'Crowd desk', text: 'See live rooms, manage visitors and keep performances running smoothly. An authenticator protects your actions.', path: '/admin/crowd', action: 'Manage the crowd' },
              { mark: '02', title: 'Campus studio', text: 'Adjust building names, terrain and campus landmarks. Export your corrections to publish them for everyone.', path: '/admin/campus', action: 'Edit the campus' },
            ] : [
              { mark: '01', title: 'The campus is yours to explore.', text: 'Walk the roads, play shared football at the sports ground or join a concert at the open-air theatre.', path: '/campus', action: 'Enter campus' },
              { mark: '02', title: 'A little space of your own.', text: 'Choose a handle, share your interests and make your profile feel like you. Sharing is always your choice.', path: '/me', action: 'Make your profile' },
            ]).map(card => (
              <article className="access-track-card" key={card.path}>
                <span className="access-card-number">{card.mark}</span>
                <h2>{card.title}</h2><p>{card.text}</p>
                <button className="community-primary" onClick={() => navigate(card.path)}>{card.action} ↗</button>
              </article>
            ))}
          </div>
          <div className="access-portal-actions">
            <button className="community-secondary" onClick={() => navigate(admin ? '/student' : '/people')}>
              {admin ? 'Enjoy the student experience ↗' : 'Meet the community ↗'}
            </button>
            {!admin && isAdmin && <button className="community-secondary" onClick={() => navigate('/admin')}>Open admin space ↗</button>}
          </div>
        </>
      )}
    </main>
  )
}
