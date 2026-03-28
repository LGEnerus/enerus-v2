import { Suspense } from 'react'
import NewWorkClient from './NewWorkClient'
export default function Page() {
  return <Suspense fallback={<div className="min-h-screen bg-gray-950"/>}><NewWorkClient/></Suspense>
}