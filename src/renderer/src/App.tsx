import { useState } from 'react'
import Practice from './components/Practice'
import History from './components/History'
import Progress from './components/Progress'

type Tab = 'practice' | 'history' | 'progress'

export default function App() {
  const [tab, setTab] = useState<Tab>('practice')

  return (
    <div className="app">
      <nav className="tabs">
        <button className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')}>
          Practice
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          History
        </button>
        <button className={tab === 'progress' ? 'active' : ''} onClick={() => setTab('progress')}>
          Progress
        </button>
      </nav>

      <main>
        {tab === 'practice' && <Practice />}
        {tab === 'history' && <History />}
        {tab === 'progress' && <Progress />}
      </main>
    </div>
  )
}
