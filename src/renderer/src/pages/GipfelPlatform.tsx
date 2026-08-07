import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const GipfelPlatform: React.FC = () => {
  const navigate = useNavigate()

  useEffect(() => {
    // 在主进程打开新窗口显示 Gipfel 平台
    window.api.invoke('open-gipfel-window')
    // 返回上一页
    navigate(-1)
  }, [])

  return null
}

export default GipfelPlatform
