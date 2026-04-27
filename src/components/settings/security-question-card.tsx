'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Save,
  ShieldCheck,
  AlertTriangle,
  Pencil,
  Plus,
  CheckCircle2,
} from 'lucide-react'
import { useSecurityQuestion, useUpdateSecurityQuestion } from '@/hooks/api/use-settings'

const SECURITY_QUESTIONS = [
  { value: 'petName', label: '¿Cuál es el nombre de tu primera mascota?' },
  { value: 'motherName', label: '¿Cuál es el nombre de tu madre?' },
  { value: 'birthCity', label: '¿En qué ciudad naciste?' },
  { value: 'firstSchool', label: '¿Cuál fue tu primer colegio?' },
  { value: 'favoriteFood', label: '¿Cuál es tu comida favorita?' },
] as const

export function SecurityQuestionCard() {
  const { user, token } = useAuthStore()
  const { data: secData, isLoading: loading } = useSecurityQuestion(user?.id != null ? String(user.id) : undefined)
  const updateMutation = useUpdateSecurityQuestion()

  const [editing, setEditing] = useState(false)
  const [selectedQuestion, setSelectedQuestion] = useState('')
  const [answer, setAnswer] = useState('')

  const hasQuestion = secData?.hasQuestion ?? null
  const currentQuestion = secData?.question ?? null

  function startEdit() {
    setSelectedQuestion('')
    setAnswer('')
    setEditing(true)
  }

  async function handleSave() {
    if (!user?.id || !selectedQuestion || !answer.trim()) {
      toast.error('Selecciona una pregunta y escribe tu respuesta')
      return
    }
    if (answer.trim().length < 2) {
      toast.error('La respuesta debe tener al menos 2 caracteres')
      return
    }
    try {
      await updateMutation.mutateAsync({
        userId: String(user.id),
        question: selectedQuestion,
        answer: answer.trim(),
      })
      toast.success('Pregunta de seguridad guardada correctamente')
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

  if (loading) {
    return (
      <Card className="border-border/50 rounded-xl">
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
        </CardContent>
      </Card>
    )
  }

  if (editing) {
    return (
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Configurar Pregunta de Seguridad
          </CardTitle>
          <CardDescription>
            Selecciona una pregunta secreta y escribe tu respuesta. Esta información se usará para restablecer tu contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Pregunta de seguridad</Label>
            <Select value={selectedQuestion} onValueChange={setSelectedQuestion}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una pregunta..." />
              </SelectTrigger>
              <SelectContent>
                {SECURITY_QUESTIONS.map(q => (
                  <SelectItem key={q.value} value={q.value}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sec-answer">Tu respuesta</Label>
            <Input
              id="sec-answer"
              placeholder="Escribe tu respuesta"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">La respuesta no distingue mayúsculas. Recuérdala bien.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !selectedQuestion || !answer.trim()}
              className="gap-2 active:scale-[0.98] transition-all"
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditing(false)}
              className="gap-2"
            >
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Pregunta de Seguridad
            </CardTitle>
            <CardDescription className="mt-1">
              Usada para restablecer tu contraseña si la olvidas
            </CardDescription>
          </div>
          {hasQuestion ? (
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Configurada
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-500/30">
              <AlertTriangle className="h-3 w-3 mr-1" />
              No configurada
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasQuestion && currentQuestion ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
              <p className="text-sm font-medium">{currentQuestion}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Tu pregunta de seguridad está configurada. Puedes cambiarla en cualquier momento.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={startEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
              Cambiar pregunta
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-300 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    Sin pregunta de seguridad
                  </p>
                  <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-0.5">
                    Si olvidas tu contraseña, no podrás restablecerla por tu cuenta. Configura una pregunta de seguridad para proteger tu acceso.
                  </p>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              className="gap-2"
              onClick={startEdit}
            >
              <Plus className="h-3.5 w-3.5" />
              Configurar ahora
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
