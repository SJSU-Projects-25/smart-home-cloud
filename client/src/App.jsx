import { useEffect, useMemo, useState } from 'react'
import { initializeApp, getApp, getApps } from 'firebase/app'
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken,
  signOut,
} from 'firebase/auth'
import {
  Activity,
  AlertTriangle,
  AudioWaveform,
  BellRing,
  Cpu,
  Home,
  Menu,
  PlusCircle,
  Power,
  ServerCog,
  ShieldCheck,
  Signal,
  Waves,
} from 'lucide-react'

const firebaseConfig =
  typeof globalThis !== 'undefined' && globalThis.__firebase_config
    ? globalThis.__firebase_config
    : {
        apiKey: 'demo-api-key',
        authDomain: 'smart-home-cloud.firebaseapp.com',
        projectId: 'smart-home-cloud',
      }

// Firebase/Firestore setup replaces the relational PostgreSQL/Amazon RDS data tier for this demo build.
const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig, globalThis.__app_id || 'smart-home-demo')

const db = getFirestore(firebaseApp)
const auth = getAuth(firebaseApp)

const roleOptions = ['Owner', 'Admin', 'Tech']
const deviceTypes = [
  { value: 'audio_sensor', label: 'Audio Sensor' },
  { value: 'doorway_array', label: 'Doorway Array' },
  { value: 'smoke_combo', label: 'Smoke + CO Combo' },
  { value: 'glass_sensor', label: 'Glass Break Sensor' },
]

const alertCatalog = [
  { type: 'scream', label: 'Scream Detected', severityPool: ['High'] },
  { type: 'smoke_alarm', label: 'Smoke Alarm', severityPool: ['High'] },
  { type: 'glass_break', label: 'Glass Break', severityPool: ['Medium', 'High'] },
  { type: 'distress_call', label: 'Distress Call', severityPool: ['Medium'] },
  { type: 'ambient_noise', label: 'Noise Spike', severityPool: ['Low', 'Medium'] },
]

const statusStyles = {
  open: 'bg-rose-500/10 text-rose-300 border border-rose-500/20',
  acked: 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  escalated: 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20',
  closed: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
}

const severityStyles = {
  High: 'text-rose-300 bg-rose-500/10',
  Medium: 'text-amber-300 bg-amber-500/10',
  Low: 'text-emerald-300 bg-emerald-500/10',
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'devices', label: 'Device Manager', icon: Cpu },
  { id: 'alerts', label: 'Alert Center', icon: BellRing },
]

const formatTimestamp = (timestamp) => {
  if (!timestamp) return '—'
  const date = timestamp.seconds
    ? new Date(timestamp.seconds * 1000)
    : new Date(timestamp)
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const randomFrom = (list) => list[Math.floor(Math.random() * list.length)]

function App() {
  const [role, setRole] = useState(roleOptions[0])
  const [homeInput, setHomeInput] = useState('home-alpha')
  const [activeHomeId, setActiveHomeId] = useState('home-alpha')
  const [view, setView] = useState('dashboard')
  const [authUser, setAuthUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)

  const [devices, setDevices] = useState([])
  const [alerts, setAlerts] = useState([])
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [alertsLoading, setAlertsLoading] = useState(false)

  const [deviceModalOpen, setDeviceModalOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState(null)
  const [deviceForm, setDeviceForm] = useState({ name: '', type: deviceTypes[0].value })
  const [savingDevice, setSavingDevice] = useState(false)

  const [heartbeatBusy, setHeartbeatBusy] = useState('')
  const [clipBusy, setClipBusy] = useState('')
  const [alertBusy, setAlertBusy] = useState('')

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [toasts, setToasts] = useState([])

  const pushToast = (title, description, tone = 'info') => {
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((prev) => [...prev, { id, title, description, tone }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 4500)
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user)
      setAuthReady(true)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!authUser || !activeHomeId) return
    setDevicesLoading(true)
    const devicesRef = collection(db, 'devices')
    const q = query(devicesRef, where('home_id', '==', activeHomeId), orderBy('name'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextDevices = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        setDevices(nextDevices)
        setDevicesLoading(false)
      },
      () => setDevicesLoading(false),
    )
    return unsubscribe
  }, [authUser, activeHomeId])

  useEffect(() => {
    if (!authUser || !activeHomeId) return
    setAlertsLoading(true)
    const alertsRef = collection(db, 'alerts')
    const q = query(alertsRef, where('home_id', '==', activeHomeId), orderBy('created_at', 'desc'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextAlerts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        setAlerts(nextAlerts)
        setAlertsLoading(false)
      },
      () => setAlertsLoading(false),
    )
    return unsubscribe
  }, [authUser, activeHomeId])

  const activeAlertCount = useMemo(
    () => alerts.filter((alert) => alert.status !== 'closed').length,
    [alerts],
  )
  const onlineDevices = useMemo(
    () => devices.filter((device) => device.status === 'online').length,
    [devices],
  )

  const handleLogin = async (event) => {
    event.preventDefault()
    setAuthBusy(true)
    try {
      const trimmedHome = (homeInput || '').trim() || 'home-alpha'
      let credential
      if (globalThis.__initial_auth_token) {
        credential = await signInWithCustomToken(auth, globalThis.__initial_auth_token)
      } else {
        credential = await signInAnonymously(auth)
      }
      await setDoc(
        doc(db, 'users', credential.user.uid),
        {
          role,
          home_id: trimmedHome,
          updated_at: serverTimestamp(),
        },
        { merge: true },
      )
      setActiveHomeId(trimmedHome)
      pushToast('Signed in', `Ready as ${role} for ${trimmedHome}`, 'success')
    } catch (error) {
      pushToast('Authentication failed', error.message, 'error')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleSignOut = async () => {
    await signOut(auth)
    setDevices([])
    setAlerts([])
    setView('dashboard')
    pushToast('Signed out', 'Session closed for this browser tab', 'info')
  }

  const openDeviceModal = (device = null) => {
    setEditingDevice(device)
    setDeviceForm({
      name: device?.name || '',
      type: device?.type || deviceTypes[0].value,
    })
    setDeviceModalOpen(true)
  }

  const saveDevice = async (event) => {
    event.preventDefault()
    if (!deviceForm.name.trim()) {
      pushToast('Device name required', 'Please provide a friendly name.', 'error')
      return
    }
    setSavingDevice(true)
    try {
      if (editingDevice) {
        await updateDoc(doc(db, 'devices', editingDevice.id), {
          name: deviceForm.name.trim(),
          type: deviceForm.type,
          updated_at: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, 'devices'), {
          home_id: activeHomeId,
          name: deviceForm.name.trim(),
          type: deviceForm.type,
          status: 'online',
          last_seen_at: serverTimestamp(),
          created_at: serverTimestamp(),
        })
      }
      setDeviceModalOpen(false)
      setEditingDevice(null)
      pushToast('Device saved', `${deviceForm.name.trim()} synced to ${activeHomeId}`, 'success')
    } catch (error) {
      pushToast('Device save failed', error.message, 'error')
    } finally {
      setSavingDevice(false)
    }
  }

  const sendHeartbeat = async (device) => {
    setHeartbeatBusy(device.id)
    try {
      await updateDoc(doc(db, 'devices', device.id), {
        status: 'online',
        last_seen_at: serverTimestamp(), // Device heartbeat stands in for IoT Core/Device Gateway status updates.
      })
      pushToast('Heartbeat sent', `${device.name} is online`, 'success')
    } catch (error) {
      pushToast('Heartbeat failed', error.message, 'error')
    } finally {
      setHeartbeatBusy('')
    }
  }

  const sendTestClip = async (device) => {
    setClipBusy(device.id)
    try {
      const eventRef = await addDoc(collection(db, 'events'), {
        home_id: activeHomeId,
        device_id: device.id,
        device_name: device.name,
        timestamp: serverTimestamp(),
        s3_key_mock: `audio/${device.id}/${Date.now()}.wav`,
      }) // This ingestion write replaces the real S3 presign + SQS enqueue pipeline.

      const inferenceChoice = randomFrom(alertCatalog)
      const severity = randomFrom(inferenceChoice.severityPool)
      setTimeout(async () => {
        try {
          await addDoc(collection(db, 'alerts'), {
            home_id: activeHomeId,
            device_id: device.id,
            device_name: device.name,
            type: inferenceChoice.type,
            type_label: inferenceChoice.label,
            severity,
            status: 'open',
            created_at: serverTimestamp(),
            event_id: eventRef.id,
          }) // The 3-second delay + inline alert write stands in for the async ML inference worker.
          pushToast('Inference complete', `${inferenceChoice.label} classified`, 'info')
        } catch (error) {
          pushToast('Alert fan-out failed', error.message, 'error')
        }
      }, 3000)

      pushToast('Test clip sent', `${device.name} uploaded sample audio`, 'success')
    } catch (error) {
      pushToast('Clip upload failed', error.message, 'error')
    } finally {
      setClipBusy('')
    }
  }

  const updateAlertStatus = async (alert, status) => {
    setAlertBusy(alert.id)
    try {
      await updateDoc(doc(db, 'alerts', alert.id), {
        status,
        updated_at: serverTimestamp(),
      }) // Alert actions would normally trigger SNS/SES style notification fan-out.
      const actionLabel = status === 'acked' ? 'Acknowledged' : status === 'escalated' ? 'Escalated' : 'Closed'
      console.info(`[Notification Mock] ${actionLabel} alert ${alert.id}`)
      pushToast(`${actionLabel} alert`, `${alert.type_label || alert.type} updated`, 'success')
    } catch (error) {
      pushToast('Alert update failed', error.message, 'error')
    } finally {
      setAlertBusy('')
    }
  }

  const alertActions = (alert) => {
    if (alert.status === 'open') {
      return (
        <div className="flex gap-2">
          <button
            onClick={() => updateAlertStatus(alert, 'acked')}
            className="px-3 py-1.5 text-xs rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/30"
            disabled={alertBusy === alert.id}
          >
            Ack
          </button>
          <button
            onClick={() => updateAlertStatus(alert, 'escalated')}
            className="px-3 py-1.5 text-xs rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-500/30"
            disabled={alertBusy === alert.id}
          >
            Escalate
          </button>
        </div>
      )
    }
    if (alert.status === 'acked') {
      return (
        <button
          onClick={() => updateAlertStatus(alert, 'closed')}
          className="px-3 py-1.5 text-xs rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
          disabled={alertBusy === alert.id}
        >
          Close
        </button>
      )
    }
    if (alert.status === 'escalated') {
      return (
        <div className="flex gap-2">
          <button
            onClick={() => updateAlertStatus(alert, 'acked')}
            className="px-3 py-1.5 text-xs rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/30"
            disabled={alertBusy === alert.id}
          >
            Ack
          </button>
          <button
            onClick={() => updateAlertStatus(alert, 'closed')}
            className="px-3 py-1.5 text-xs rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
            disabled={alertBusy === alert.id}
          >
            Close
          </button>
        </div>
      )
    }
    return <span className="text-emerald-300 text-xs">Complete</span>
  }

  const renderKpis = () => (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Active Alerts</p>
            <p className="text-3xl font-semibold mt-2">{activeAlertCount}</p>
          </div>
          <AlertTriangle className="w-10 h-10 text-rose-400" />
        </div>
        <p className="text-sm text-slate-400 mt-3">Real-time feed via Firestore listeners</p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Devices Online</p>
            <p className="text-3xl font-semibold mt-2">{onlineDevices}</p>
          </div>
          <ServerCog className="w-10 h-10 text-sky-400" />
        </div>
        <p className="text-sm text-slate-400 mt-3">Heartbeat simulation every manual ping</p>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-500">Home ID</p>
            <p className="text-3xl font-semibold mt-2 truncate">{activeHomeId}</p>
          </div>
          <ShieldCheck className="w-10 h-10 text-emerald-400" />
        </div>
        <p className="text-sm text-slate-400 mt-3">Scoped Firestore collections per home</p>
      </div>
    </div>
  )

  const renderDeviceManager = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black/40">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Devices</p>
          <h2 className="text-2xl font-semibold">Managed Endpoints</h2>
        </div>
        <button
          onClick={() => openDeviceModal()}
          className="inline-flex items-center gap-2 bg-sky-500/20 border border-sky-500/40 text-sky-200 px-4 py-2 rounded-full"
        >
          <PlusCircle className="w-4 h-4" /> Add Device
        </button>
      </div>
      <div className="mt-6 space-y-4">
        {devicesLoading && <p className="text-slate-500">Loading devices...</p>}
        {!devicesLoading && devices.length === 0 && (
          <p className="text-slate-500">No devices registered for {activeHomeId}.</p>
        )}
        {devices.map((device) => (
          <div
            key={device.id}
            className="border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-950/40"
          >
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-800">
                  <Cpu className="w-5 h-5 text-sky-300" />
                </div>
                <div>
                  <p className="font-semibold text-lg">{device.name}</p>
                  <p className="text-sm text-slate-500 capitalize">{device.type?.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className={`px-3 py-1 rounded-full ${device.status === 'online' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                  {device.status || 'offline'}
                </span>
                <span className="px-3 py-1 rounded-full border border-slate-800">
                  Last seen {formatTimestamp(device.last_seen_at)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => sendHeartbeat(device)}
                disabled={heartbeatBusy === device.id}
                className="px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-100 text-sm inline-flex items-center gap-2"
              >
                <Activity className="w-4 h-4" />
                {heartbeatBusy === device.id ? 'Pinging...' : 'Heartbeat'}
              </button>
              <button
                onClick={() => sendTestClip(device)}
                disabled={clipBusy === device.id}
                className="px-4 py-2 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-100 text-sm inline-flex items-center gap-2"
              >
                <AudioWaveform className="w-4 h-4" />
                {clipBusy === device.id ? 'Simulating...' : 'Send Test Clip'}
              </button>
              <button
                onClick={() => openDeviceModal(device)}
                className="px-4 py-2 rounded-full bg-slate-800 border border-slate-700 text-slate-100 text-sm"
              >
                Configure
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderAlertCenter = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black/40">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500">Real-time</p>
          <h2 className="text-2xl font-semibold">Alert Lifecycle</h2>
        </div>
        <span className="text-sm text-slate-400">Connected to /alerts feed</span>
      </div>
      <div className="mt-6 space-y-4">
        {alertsLoading && <p className="text-slate-500">Listening for alerts…</p>}
        {!alertsLoading && alerts.length === 0 && (
          <p className="text-slate-500">Quiet home. No alerts yet.</p>
        )}
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="border border-slate-800 rounded-2xl p-4 bg-slate-950/40 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-slate-800">
                <BellRing className="w-5 h-5 text-rose-300" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-lg">{alert.type_label || alert.type}</p>
                  <span className={`text-xs px-3 py-1 rounded-full border ${severityStyles[alert.severity] || 'border-slate-700 text-slate-300'}`}>
                    {alert.severity}
                  </span>
                  <span className={`text-xs px-3 py-1 rounded-full ${statusStyles[alert.status] || 'border border-slate-700 text-slate-300'}`}>
                    {alert.status}
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  Device {alert.device_name || alert.device_id} • {formatTimestamp(alert.created_at)}
                </p>
              </div>
            </div>
            <div>{alertActions(alert)}</div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderDashboard = () => (
    <div className="space-y-6">
      {renderKpis()}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black/40 flex flex-col">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-500">Live Alerts</p>
              <h2 className="text-2xl font-semibold">Realtime Feed</h2>
            </div>
            <Signal className="w-6 h-6 text-sky-400" />
          </div>
          <div className="mt-6 space-y-4 flex-1">
            {alerts.slice(0, 4).map((alert) => (
              <div key={alert.id} className="border border-slate-800 rounded-2xl p-4 bg-slate-950/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{alert.type_label || alert.type}</p>
                    <p className="text-xs text-slate-500">
                      {alert.device_name || alert.device_id} · {formatTimestamp(alert.created_at)}
                    </p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full ${statusStyles[alert.status] || 'border border-slate-700 text-slate-300'}`}>
                    {alert.status}
                  </span>
                </div>
              </div>
            ))}
            {alerts.length === 0 && <p className="text-slate-500">No alerts in the last few minutes.</p>}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl shadow-black/40 flex flex-col">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-slate-500">Fleet Health</p>
              <h2 className="text-2xl font-semibold">Audio Ingestion</h2>
            </div>
            <Waves className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="mt-6 space-y-4 flex-1">
            {devices.slice(0, 4).map((device) => (
              <div key={device.id} className="border border-slate-800 rounded-2xl p-4 bg-slate-950/50 flex items-center justify-between">
                <div>
                  <p className="font-medium">{device.name}</p>
                  <p className="text-xs text-slate-500">{device.type?.replace('_', ' ')} · {device.status}</p>
                </div>
                <button
                  onClick={() => sendTestClip(device)}
                  disabled={clipBusy === device.id}
                  className="px-3 py-1.5 text-xs rounded-full border border-slate-700"
                >
                  {clipBusy === device.id ? 'Simulating…' : 'Send Clip'}
                </button>
              </div>
            ))}
            {devices.length === 0 && <p className="text-slate-500">No devices online yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )

  const renderContent = () => {
    if (view === 'devices') return renderDeviceManager()
    if (view === 'alerts') return renderAlertCenter()
    return renderDashboard()
  }

  if (!authReady || !authUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-10 space-y-8">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Smart Home Cloud</p>
            <h1 className="text-3xl font-semibold mt-3">Role-based Login</h1>
            <p className="text-slate-400 mt-2">
              Choose a role, set your home scope, and authenticate with the injected token to preview the CMPE 281 platform demo.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <p className="text-sm text-slate-400 mb-3">Select Role</p>
              <div className="grid grid-cols-3 gap-3">
                {roleOptions.map((roleOption) => (
                  <button
                    key={roleOption}
                    type="button"
                    onClick={() => setRole(roleOption)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
                      role === roleOption ? 'border-sky-400 bg-sky-500/10 text-sky-100' : 'border-slate-700 text-slate-400'
                    }`}
                  >
                    {roleOption}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-slate-400">Home ID</label>
              <input
                value={homeInput}
                onChange={(event) => setHomeInput(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-slate-100 focus:border-sky-500 focus:outline-none"
                placeholder="home-alpha"
              />
            </div>
            <button
              type="submit"
              disabled={authBusy}
              className="w-full bg-sky-500 text-slate-950 py-3 rounded-2xl font-semibold tracking-wide hover:bg-sky-400 transition"
            >
              {authBusy ? 'Connecting…' : 'Launch Console'}
            </button>
          </form>
          <p className="text-xs text-slate-500">
            Authentication uses the provided custom token via Firebase Auth (stubbing Okta/Cognito) and persists user metadata inside Firestore.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="hidden lg:flex w-72 flex-col border-r border-slate-900 bg-slate-950/80">
        <div className="px-8 py-10">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Smart Home</p>
          <h2 className="text-2xl font-semibold mt-2">Cloud Console</h2>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition ${
                view === id
                  ? 'bg-sky-500/10 border border-sky-500/30 text-white'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="px-8 py-6 border-t border-slate-900 text-sm text-slate-500">
          Logged in as {role}
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="border-b border-slate-900 bg-slate-950/70 backdrop-blur-xl">
          <div className="px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button className="lg:hidden rounded-2xl border border-slate-800 p-2" onClick={() => setMobileNavOpen((prev) => !prev)}>
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <p className="text-xs text-slate-500">Home</p>
                <p className="font-semibold">{activeHomeId}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-3 rounded-2xl border border-slate-800 px-4 py-2">
                <div>
                  <p className="text-xs text-slate-500">Role</p>
                  <p className="font-semibold">{role}</p>
                </div>
                <div className="w-px h-8 bg-slate-800" />
                <div>
                  <p className="text-xs text-slate-500">Devices</p>
                  <p className="font-semibold">{devices.length}</p>
                </div>
                <div className="w-px h-8 bg-slate-800" />
                <div>
                  <p className="text-xs text-slate-500">Alerts</p>
                  <p className="font-semibold">{alerts.length}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-800 px-4 py-2 text-sm"
              >
                <Power className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
          {mobileNavOpen && (
            <div className="lg:hidden px-4 pb-4 flex gap-2">
              {navItems.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => {
                    setView(id)
                    setMobileNavOpen(false)
                  }}
                  className={`flex-1 rounded-2xl border px-3 py-2 text-sm ${
                    view === id ? 'border-sky-400 text-white' : 'border-slate-800 text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </header>
        <main className="flex-1 p-6 space-y-6 bg-gradient-to-b from-slate-950 to-slate-900 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      {deviceModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40">
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-8 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm text-slate-500">{editingDevice ? 'Update Device' : 'Register Device'}</p>
                <h3 className="text-2xl font-semibold">{editingDevice ? editingDevice.name : 'New audio sensor'}</h3>
              </div>
              <button onClick={() => setDeviceModalOpen(false)} className="text-slate-500 hover:text-white">
                ✕
              </button>
            </div>
            <form className="space-y-5" onSubmit={saveDevice}>
              <div>
                <label className="text-sm text-slate-400">Friendly Name</label>
                <input
                  value={deviceForm.name}
                  onChange={(event) => setDeviceForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 focus:border-sky-500 focus:outline-none"
                  placeholder="e.g. South Wing Node"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400">Device Type</label>
                <select
                  value={deviceForm.type}
                  onChange={(event) => setDeviceForm((prev) => ({ ...prev, type: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-100 focus:border-sky-500 focus:outline-none"
                >
                  {deviceTypes.map((typeOption) => (
                    <option key={typeOption.value} value={typeOption.value}>
                      {typeOption.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4">
                <button type="button" onClick={() => setDeviceModalOpen(false)} className="px-4 py-2 rounded-2xl border border-slate-700 text-slate-400">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDevice}
                  className="px-5 py-2 rounded-2xl bg-sky-500 text-slate-950 font-semibold"
                >
                  {savingDevice ? 'Saving…' : 'Save Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 right-6 space-y-3 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`min-w-[260px] rounded-2xl border px-4 py-3 shadow-lg shadow-black/40 ${
              toast.tone === 'error'
                ? 'border-rose-500/30 bg-rose-500/10'
                : toast.tone === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-900/90'
            }`}
          >
            <p className="text-sm font-semibold">{toast.title}</p>
            <p className="text-xs text-slate-300">{toast.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
