import { Link, useNavigate } from 'react-router-dom'
import { Key, LogOut } from 'lucide-react'
import { Card, Row } from './CaseCard'
import { useAuth } from '@/context/auth'

export default function ProfileSection() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900">My Information</h2>
      <Card title="Account">
        <Row label="Name" value={user.name} />
        <Row label="Role" value={user.role} />
        <Row label="Email verified" value={user.email_verified ? 'Yes' : 'No'} />
      </Card>
      <Card title="Security">
        <div className="py-1">
          <Link to="/forgot-password"
            className="inline-flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 hover:border-gray-300 px-4 py-2.5 rounded-xl transition-all shadow-sm font-medium">
            <Key className="w-4 h-4 text-gray-400" /> Change password
          </Link>
        </div>
      </Card>
      <Card title="Session">
        <div className="py-1">
          <button
            onClick={async () => { await logout(); navigate('/login') }}
            className="inline-flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </Card>
    </div>
  )
}
