import Modal from './Modal'
import SignInForm from './SignInForm'
export default function AuthDialog({onClose}:{onClose:()=>void}) {
  return <Modal title="Community sign-in" onClose={onClose}><SignInForm/></Modal>
}
