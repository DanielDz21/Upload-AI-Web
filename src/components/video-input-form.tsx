import { FileVideo, Upload } from 'lucide-react'
import { Separator } from './ui/separator'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Button } from './ui/button'
import { FormEvent, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/axios'
import { getFFmpeg } from '@/lib/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

interface VideoInputFormProps {
    onVideoUploaded: (videoId: string) => void
}

type Status = 'idle' | 'converting' | 'uploading' | 'generating' | 'done'

const statusMessages = {
    converting: 'Convertendo vídeo...',
    uploading: 'Carregando...',
    generating: 'Gerando transcrição...',
    done: 'Vídeo carregado com sucesso!'
}

export function VideoInputForm({ onVideoUploaded }: VideoInputFormProps) {
    const [videoFile, setVideoFile] = useState<File | null>(null)
    const [status, setStatus] = useState<Status>('idle')

    const promptInputRef = useRef<HTMLTextAreaElement>(null)

    function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
        const { files } = event.currentTarget

        if (!files) { return }

        setVideoFile(files[0])
    }

    async function convertVideoToAudio(video: File) {
        const ffmpeg = await getFFmpeg()
        await ffmpeg.writeFile('input.mp4', await fetchFile(video))

        ffmpeg.on('progress', (progress) => { console.log(progress) })

        await ffmpeg.exec([
            '-i', 'input.mp4', // input file
            '-map', '0:a', // select audio streams
            '-b:a', '20k', // set audio bitrate
            '-acodec', 'libmp3lame', // set audio codec
            'output.mp3' // output file
        ])

        const data = await ffmpeg.readFile('output.mp3')
        const audioFileBlob = new Blob([data], { type: 'audio/mpeg' })
        const audioFile = new File([audioFileBlob], 'output.mp3', { type: 'audio/mpeg' })

        return audioFile
    }

    async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const prompt = promptInputRef.current?.value

        if (!videoFile) { return }

        setStatus('converting')
        const audioFile = await convertVideoToAudio(videoFile)

        const data = new FormData()
        data.append('file', audioFile)

        setStatus('uploading')
        const response = await api.post('/videos', data)
        const videoId = response.data.video.id

        setStatus('generating')
        await api.post(`/videos/${videoId}/transcription`, { prompt })

        setStatus('done')
        onVideoUploaded(videoId)
    }

    const previewURL = useMemo(() => {
        if (!videoFile) { return null }

        return URL.createObjectURL(videoFile)
    }, [videoFile])

    return (
        <form className='space-y-6' onSubmit={handleUploadVideo}>
            <label
                htmlFor='video'
                className='relative border flex rounded-md aspect-video cursor-pointer border-dashed text-sm flex-col gap-2 items-center justify-center text-muted-foreground hover:bg-primary/5'
            >
                {previewURL ? (
                    <video src={previewURL} controls={false} className='pointer-events-none absolute inset-0' />
                ) : (
                    <>
                        <FileVideo className='w-4 h-4' />
                        Selecione um vídeo
                    </>
                )}
            </label>

            <input type='file' id='video' accept='video/mp4' className='sr-only' onChange={handleFileSelected} />

            <Separator />

            <div className='space-y-2'>
                <Label htmlFor='transcription_prompt'>Prompt de transcrição</Label>
                <Textarea
                    ref={promptInputRef}
                    disabled={status !== 'idle'}
                    id='transcription_prompt'
                    className='h-20 leading-relaxed resize-none'
                    placeholder='Inclua palavras-chave mencionadas no vídeo separadas por vírgula (,)'
                />
            </div>

            <Button
                data-success={status === 'done'}
                disabled={status !== 'idle'}
                type='submit'
                className='w-full data-[success]:bg-emerald-400'
            >
                {status === 'idle' ? (
                    <>
                        Carregar vídeo
                        <Upload className='w-4 h-4 ml-2' />
                    </>
                ) : statusMessages[status]}
            </Button>
        </form>
    )
}