import { useEffect, useRef } from 'react'

export function ShaderAnimation({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl')
    if (!gl) return

    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, `attribute vec2 p; void main(){ gl_Position=vec4(p,0,1); }`)
    gl.compileShader(vs)

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, `
      precision highp float;
      uniform vec2 res; uniform float t;
      void main(){
        vec2 uv=(gl_FragCoord.xy*2.0-res)/min(res.x,res.y);
        float time=t*0.05; float lw=0.002;
        vec3 col=vec3(0);
        for(int j=0;j<3;j++)
          for(int i=0;i<5;i++)
            col[j]+=lw*float(i*i)/abs(fract(time-0.01*float(j)+float(i)*0.01)*5.0-length(uv)+mod(uv.x+uv.y,0.2));
        gl_FragColor=vec4(col,1);
      }
    `)
    gl.compileShader(fs)

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs); gl.attachShader(prog, fs)
    gl.linkProgram(prog); gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const resU = gl.getUniformLocation(prog, 'res')
    const tU   = gl.getUniformLocation(prog, 't')
    let time = 0, id: number

    const resize = () => {
      canvas.width  = canvas.clientWidth
      canvas.height = canvas.clientHeight
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(resU, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const tick = () => { id = requestAnimationFrame(tick); time += 0.05; gl.uniform1f(tU, time); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4) }
    tick()

    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} className={`block w-full h-full ${className ?? ''}`} />
}
