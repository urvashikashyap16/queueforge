import Layout from '../components/Layout'
import ForgeLine from '../components/ForgeLine'
import ThroughputChart from '../components/ThroughputChart'
import HealthPanel from '../components/HealthPanel'
import QueueTable from '../components/QueueTable'
import EventFeed from '../components/EventFeed'
import TypeTable from '../components/TypeTable'
import { usePolling } from '../lib/context'

export default function Overview() {
  const { data: stats, reload } = usePolling((api) => api.stats(), { interval: 2000 })

  return (
    <Layout title="Overview" description="Every job across all queues and workers, updating live.">
      <div className="space-y-4">
        <ForgeLine stats={stats} />
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2"><ThroughputChart points={stats?.throughput} /></div>
          <HealthPanel stats={stats} />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <QueueTable queues={stats?.queues} onChange={reload} />
            <TypeTable rows={stats?.byType} />
          </div>
          <EventFeed />
        </div>
      </div>
    </Layout>
  )
}
