'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const DOC_TYPES = [
  { id: 'survey_photo',       label: 'Survey photos',          icon: '📷', accept: 'image/*', multiple: true },
  { id: 'signed_acceptance',  label: 'Signed customer acceptance', icon: '✍️', accept: '.pdf,image/*', multiple: false },
  { id: 'epc_cert',           label: 'EPC certificate',        icon: '🏠', accept: '.pdf,image/*', multiple: false },
  { id: 'mcs_certificate',    label: 'MCS certificate',        icon: '🏅', accept: '.pdf,image/*', multiple: false },
  { id: 'commissioning_cert', label: 'Commissioning records',  icon: '🔧', accept: '.pdf,image/*', multiple: true },
  { id: 'insurance_doc',      label: 'Insurance documents',    icon: '🛡', accept: '.pdf', multiple: false },
  { id: 'other',              label: 'Other documents',        icon: '📎', accept: '*', multiple: true },
]

type JobDoc = {
  id: string
  document_type: string
  file_name: string
  file_path: string
  file_size_bytes: number
  mime_type: string
  notes: string
  created_at: string
}

export default function DocumentsPage() {
  const params = useParams()
  const jobId = params.id as string
  const [documents, setDocuments] = useState<JobDoc[]>([])
  const [customer, setCustomer] = useState<any>(null)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { load() }, [jobId])

  async function load() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { window.location.replace('/login'); return }
    const { data: jd } = await (supabase as any).from('jobs').select('*').eq('id', jobId).single()
    if (!jd) { window.location.replace('/jobs'); return }
    const { data: cd } = await (supabase as any).from('customers').select('*').eq('id', jd.customer_id).single()
    setCustomer(cd)
    const { data: docs } = await (supabase as any).from('job_documents').select('*').eq('job_id', jobId).order('created_at', { ascending: false })
    setDocuments(docs || [])
    setLoading(false)
  }

  async function uploadFiles(files: FileList, docType: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setUploading(p => ({ ...p, [docType]: true }))
    setError('')
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop()
        const path = `${jobId}/${docType}/${Date.now()}_${file.name}`
        const { error: upErr } = await supabase.storage.from('job-documents').upload(path, file)
        if (upErr) throw upErr
        const { error: dbErr } = await (supabase as any).from('job_documents').insert({
          job_id: jobId,
          uploaded_by: session.user.id,
          document_type: docType,
          file_name: file.name,
          file_path: path,
          file_size_bytes: file.size,
          mime_type: file.type,
          stage: 'general',
        })
        if (dbErr) throw dbErr
      }
      await load()
    } catch (e: any) { setError(e.message) }
    setUploading(p => ({ ...p, [docType]: false }))
  }

  async function deleteDoc(doc: JobDoc) {
    setDeleting(doc.id)
    try {
      await supabase.storage.from('job-documents').remove([doc.file_path])
      await (supabase as any).from('job_documents').delete().eq('id', doc.id)
      setDocuments(prev => prev.filter(d => d.id !== doc.id))
    } catch (e: any) { setError(e.message) }
    setDeleting(null)
  }

  async function getDownloadUrl(doc: JobDoc): Promise<string> {
    const { data } = await supabase.storage.from('job-documents').createSignedUrl(doc.file_path, 3600)
    return data?.signedUrl || ''
  }

  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-sm text-gray-400">Loading...</p></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-emerald-700 rounded-lg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">Job Documents</div>
            {customer && <div className="text-xs text-gray-400">{customer.first_name} {customer.last_name} · {customer.address_line1}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <a href={`/jobs/${jobId}`} className="text-xs text-gray-400 hover:text-gray-600">← Job</a>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {DOC_TYPES.map(dt => {
          const typeDocs = documents.filter(d => d.document_type === dt.id)
          const isUploading = uploading[dt.id]

          return (
            <div key={dt.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{dt.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{dt.label}</div>
                    <div className="text-xs text-gray-400">{typeDocs.length} file{typeDocs.length !== 1 ? 's' : ''} uploaded</div>
                  </div>
                </div>
                <label className={`cursor-pointer text-xs font-medium px-4 py-2 rounded-xl border-2 transition-colors flex items-center gap-1.5 ${isUploading ? 'border-gray-200 text-gray-400' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
                  {isUploading ? (
                    <><span className="animate-spin">⟳</span> Uploading...</>
                  ) : (
                    <><span>+</span> Upload</>
                  )}
                  <input type="file" className="hidden" accept={dt.accept} multiple={dt.multiple} disabled={isUploading}
                    ref={el => { fileRefs.current[dt.id] = el }}
                    onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files, dt.id) }}/>
                </label>
              </div>

              {typeDocs.length > 0 && (
                <div className="divide-y divide-gray-50">
                  {typeDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                      {/* File icon */}
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        {doc.mime_type?.startsWith('image/')
                          ? <span className="text-sm">🖼</span>
                          : <span className="text-sm">📄</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{doc.file_name}</div>
                        <div className="text-xs text-gray-400">
                          {fmtSize(doc.file_size_bytes)} · {new Date(doc.created_at).toLocaleDateString('en-GB')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={async () => {
                          const url = await getDownloadUrl(doc)
                          if (url) window.open(url, '_blank')
                        }} className="text-xs text-emerald-700 hover:underline px-2 py-1 rounded-lg hover:bg-emerald-50">
                          View
                        </button>
                        <button onClick={() => deleteDoc(doc)} disabled={deleting === doc.id}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50">
                          {deleting === doc.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {typeDocs.length === 0 && (
                <div className="px-5 py-6 text-center">
                  <div className="text-2xl mb-1 opacity-30">{dt.icon}</div>
                  <div className="text-xs text-gray-400">No {dt.label.toLowerCase()} uploaded yet</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}