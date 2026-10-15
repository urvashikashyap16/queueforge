import { Route, Routes } from 'react-router-dom'
import JobDrawer from './components/JobDrawer'
import Overview from './pages/Overview'
import Jobs from './pages/Jobs'
import DeadLetter from './pages/DeadLetter'
import Schedules from './pages/Schedules'
import Workers from './pages/Workers'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/dead-letter" element={<DeadLetter />} />
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/workers" element={<Workers />} />
        <Route path="*" element={<Overview />} />
      </Routes>
      <JobDrawer />
    </>
  )
}
