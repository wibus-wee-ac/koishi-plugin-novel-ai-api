import { Context, Logger, Quester, Schema, segment, Session, trimSlash } from 'koishi'
import { download, generate_code, headers, NetworkError, resizeInput, timer } from './utils'
import { } from '@koishijs/plugin-help'
import getImageSize from 'image-size'

export const name = 'novel-ai-api'
const logger = new Logger(name)

enum actions {
  getImages = '/got_image',
  img2img = '/got_image2image'
}

const modelMap = {
  safe: '0',
  nai: '1',
} as const

type Model = keyof typeof modelMap
type Orient = "portrait" | "landscape" | "square"

const models = Object.keys(modelMap) as Model[]
const orients = ["portrait", "landscape", "square"] as const

export interface Config {
  endpoint: string
  token: string
  model: Model
  orient: Orient,
  // anatomy: boolean
  basePrompt: string
  forbidden: string
  recallTimeout: number
  // maxConcurrency: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    endpoint: Schema.string().description('接口地址'),
    token: Schema.string().description('令牌授权').default(""),
  }).description('Novel-AI API配置'),
  Schema.object({
    model: Schema.union(models).description('默认的生成模型。safe 为 SFW，nai 为 NSFW，无 Furry').default('nai'),
    orient: Schema.union(orients).description('默认的图片方向。').default('portrait'),
    basePrompt: Schema.string().description('默认的附加标签。').default('masterpiece'),
    forbidden: Schema.string().role('textarea').description('违禁词列表。含有违禁词的请求将被拒绝。').default(''),
    recallTimeout: Schema.number().role('time').description('图片发送后自动撤回的时间 (设置为 0 以禁用此功能)。').default(0),
  }).description('功能设置'),
])

function errorHandler(session: Session, err: Error) {
  if (Quester.isAxiosError(err)) {
    logger.error(err)
    if (err.response?.status === 402) {
      session.send(segment("quote", { id: session.messageId }) + `[warning] 请勿以过快的速度发送不同的图片`)
      return
    } else if (err.response?.status) {
      session.send(segment("quote", { id: session.messageId }) + `[error] 请求出现错误 (HTTP ${err.response.status}, ${err.response.statusText})`)
      return
    } else if (err.code === 'ETIMEDOUT') {
      session.send(segment("quote", { id: session.messageId }) + `[error] 请求超时了`)
      return
    } else if (err.code) {
      session.send(segment("quote", { id: session.messageId }) + `[error] 请求失败了 (错误代码: ${err.code})`)
      return
    }
  }
  logger.error(err)
  session.send(segment("quote", { id: session.messageId }) + `[error]` + err)
  return
}

interface Forbidden {
  pattern: string
  strict: boolean
}

export function apply(ctx: Context, config: Config) {
  // ctx.i18n.define('zh', require('./locales/zh'))

  let forbidden: Forbidden[]

  ctx
    .accept(['forbidden'], (config) => {
      forbidden = config.forbidden.trim()
        .toLowerCase()
        .replace(/，/g, ',')
        .split(/(?:,\s*|\s*\n\s*)/g)
        .filter(Boolean)
        .map((pattern: string) => {
          const strict = pattern.endsWith('!')
          if (strict) pattern = pattern.slice(0, -1)
          pattern = pattern.replace(/[^a-z0-9]+/g, ' ').trim()
          return { pattern, strict }
        })
    }, { immediate: true })

  const token = config.token


  ctx
    .command('清晰术 <image:text>')
    .alias("清晰术", "清晰", "Real-CUGAN", "RealCUGAN", "real", "upup")
    .option("pth", "-p --pth <pth:string> 可选: conservative, [1,2,3]x, no", { fallback: "no" })
    .option("mode", "-o --mode <mode:string> 可选： [2,3,4]x", { fallback: "2x" })
    .option("tile", "-t --tile <tile:string> 可选：[0,1,2,3,4]", { fallback: "2" })
    .action(async ({ session, options }, input) => {
      const api = 'https://hf.space/embed/saber2022/Real-CUGAN/api/predict/'

      if (!input?.trim()) return session.execute('help real')

      const opth = () => {
        if (options.pth === "1x") return "denoise1x.pth"
        if (options.pth === "2x") return "denoise2x.pth"
        if (options.pth === "3x") return "denoise3x.pth"
        if (options.pth === "conservative") return "conservative.pth"
        if (options.pth === "no") return "no-denoise.pth"
        return "no-denoise.pth"
      }
      const pth = `up${options.mode}-latest-${opth()}`

      let imgUrl: string
      input = segment.transform(input, {
        image(attrs) {
          imgUrl = attrs.url
          return ''
        },
      })

      if (!imgUrl) {
        return session.text('没有检测到图片，请检查格式并给出图片。')
      }

      session.send("正在施展清晰术！")


      let imageBuff: Buffer
      try {
        imageBuff = Buffer.from(await download(ctx, imgUrl))
      } catch (err) {
        if (err instanceof NetworkError) {
          return session.text(err.message, err.params)
        }
        logger.error(err)
        return session.text("哎呀，图片加载失败了 › (╯°口°)╯")
      }

      const body = {
        cleared: false,
        example_id: null,
        session_hash: generate_code(11),
        data: [
          `data:image/png;base64,${String(imageBuff.toString('base64'))}`,
          pth,
          Number(options.tile)
        ]
      }

      try {
        const art = await ctx.http.axios(api, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          responseType: 'json',
          data: JSON.stringify(body)
        }).then(res => {
          return {
            image: res.data,
          }
        })

        const b64 = art.image.data[0].replace(/^data:image\/.*;base64,/, '').trim()
        session.send(segment('image', { url: `base64://${b64}` }))

      } catch (err) {
        return errorHandler(session, err)
      }


    })

  ctx
    .command('ai-draw <tags:text> AI画图')
    .alias("画图", "AI作画", "AI画图", "画图", "AI", "ai", "ai作图", "ai画图", "作图", "画", "约稿")
    .usage('Tags注意：tags越多越精准，使用逗号分隔，加{}代表增加权重，越多{}权重越高，不允许使用中文标签，查找标签可以使用 Danbooru。')
    .example('约稿 1girls, miku')
    .option('model', `-m [model:string] 生成模型，选填 safe/nai ${config.model}`, { fallback: config.model })  // ``-m Safe/Nai``
    .option('orient', `-o [orient:string] 生成方向，选填 Portrait/Landscape/Square 默认 ${config.orient}`, { fallback: config.orient }) // ``-s Portrait/Square/Landscape``
    .option('seed', '-s <seed:string> 画图种子，不建议使用', { fallback: "" })
    .option('img2img', '-i 以图画图')
    .option('scale', '-c <scale:number>')
    .option('strength', '-r <strength:number> 画图强度，在使用 img2img 的时候有效，选填 0-1 默认0.5', { fallback: 0.5 }) // ``-r 0.5``
    .option('debug', '-d [debug:string] 调试模式，选填 true/false 默认false', { fallback: "false" })  // ``-d true/false``
    .action(async ({ session, options }, tags) => {

      const debug = options.debug === "true" ? true : false
      let time: () => number
      if (debug) time = timer()
      let input = tags
      if (!input?.trim()) {
        if (debug) session.send(`本次查询耗时：${time()}s`)
        return session.execute('help ai')
      }

      let imgUrl: string
      if (options.img2img) {
        input = segment.transform(input, {
          image(attrs) {
            imgUrl = attrs.url
            return ''
          },
        })

        if (!imgUrl) {
          return session.text('没有检测到图片，请检查格式并给出图片。')
        }

        if (!input.trim() && !config.basePrompt) {
          return session.text('需要提供描绘标签或者 basePrompt。')
        }
      }


      const seed = options.seed ? options.seed : undefined

      input = input.toLowerCase()
        .replace(/[，]/g, ',')
      // .replace(/\s+/g, ' ') // 标签处理

      // if (/[^\s\w"'“”‘’.,>=:|\/()\[\]{}-]/.test(input)) {
      //   return "`" + input.replace(/[^\w]$/, ' ') + "` " + "您输入的标签包含了不支持的字符，请去掉再试。"
      // }

      if (/[\u4e00-\u9fa5]/.test(input)) {
        return "还用中文 Tags 我给你一拳 🤜"
      }

      // remove forbidden words
      input = input.split(/, /g).filter((word) => {
        word = word.replace(/[^a-z0-9]+/g, ' ').trim()
        for (const { pattern, strict } of forbidden) {
          if (strict && word.split(/\W+/g).includes(pattern)) {
            return false
          } else if (!strict && word.includes(pattern)) {
            return false
          }
        }
        return true
      }).join(', ')

      if (debug) session.send(`处理输入：${time()}s`)

      const model = modelMap[options.model]
      const orient = options.orient.charAt(0).toUpperCase() + options.orient.slice(1)
      session.send("在画了(´・ω・`)")

      const prompts = []
      if (input) prompts.push(input)
      if (config.basePrompt) prompts.push(config.basePrompt)
      input = prompts.join(', ')

      const parameters = {
        tags: input,
        token,
        r18: model,
        shape: orient,
      }

      if (seed) {
        Object.assign(parameters, { seed })
      }

      let imageBuff: Buffer
      if (imgUrl) {
        try {
          imageBuff = Buffer.from(await download(ctx, imgUrl))
          if (debug) session.send(`下载图片：${time()}s`)
        } catch (err) {
          if (err instanceof NetworkError) {
            return session.text(err.message, err.params)
          }
          logger.error(err)
          return session.text("哎呀，图片加载失败了 › (╯°口°)╯")
        }

        const size = getImageSize(imageBuff)
        if (debug) session.send(`获取图片尺寸：${time()}s`)
        Object.assign(parameters, {
          scale: options.scale ?? 11,
        })
        const orient = resizeInput(size)
        Object.assign(parameters, {
          strength: options.strength ?? 0.7,
        })

        if (debug) session.send(`处理图像：${time()}s`)

      } else {
        Object.assign(parameters, {
          scale: options.scale ?? 11,
          strength: options.strength ?? 0.5,
        })
        if (debug) session.send(`处理字段：${time()}s`)
      }

      if (debug) session.send(`处理提交总字段：${time()}s`)

      try {
        const path = imgUrl ? actions.img2img : actions.getImages
        // let whileConfition = true
        // session.send(config.endpoint + path + '?' + qs.stringify(parameters))

        if (debug) session.send(`开始请求：${time()}s`)

        // do {
          const art = await ctx.http.axios(trimSlash(config.endpoint) + path, {
            method: imgUrl ? 'POST' : 'GET',
            headers: {
              ...headers
            },
            responseType: 'arraybuffer',
            params: { ...parameters },
            data: imgUrl ? imageBuff.toString('base64') : ''
          }).then(res => {
            if (debug) session.send(`请求完成：${time()}s`)
            let buff = Buffer.from(res.data, 'base64')
            // whileConfition = true
            return {
              buffer: buff.toString('base64'),
              seed: res.headers['seed'],
              tags: input,
            }
          })

          if (debug) session.send(`返回数据处理完成：${time()}s`)

          const ids = await session.send(segment('message', { forward: true }, [
            segment('message', `绘画种子: ${art.seed}`),
            segment('message', `描述标签: ${art.tags}`),
            segment('image', { url: `base64://${art.buffer}` }),
          ]))

          if (debug) session.send(`发送完成：${time()}s`)

          if (config.recallTimeout) {
            ctx.setTimeout(() => {
              for (const id of ids) {
                session.bot.deleteMessage(session.channelId, id)
              }
            }, config.recallTimeout)
          }
        // } while (whileConfition)
      } catch (err) {
        return errorHandler(session, err)
      }
    })
}
