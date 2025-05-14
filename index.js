require('dotenv').config()
const { WakaTimeClient } = require('wakatime-client')
const dayjs = require('dayjs')
const { get } = require('axios')
const { Octokit } = require('@octokit/rest')
const Axios = require('axios')

// 从 .env 文件中加载环境变量
const { WAKATIME_API_KEY, GH_TOKEN, GIST_ID } = process.env

// Wakatime API 基础地址
const BASE_URL = 'https://api.wakatime.com/api/v1'
const summariesApi = `${BASE_URL}/users/current/summaries`

// 初始化 Octokit（用于操作 GitHub Gist）
const octokit = new Octokit({
  auth: `token ${GH_TOKEN}`
})

/**
 * 将项目、语言等维度信息格式化成 Markdown 文本
 * @param {string} title - 区块标题，例如 "Projects"
 * @param {Array} content - 内容数组
 */
function getItemContent(title, content) {
  let itemContent = `#### ${title} \n`
  content.forEach(item => {
    itemContent += `* ${item.name}: ${item.text} \n`
  })
  return itemContent
}

/**
 * 生成 Markdown 格式的 Gist 文本内容
 * @param {string} date - 日期
 * @param {object} summary - Wakatime 返回的摘要对象
 */
function getMessageContent(date, summary) {
  if (summary.length > 0) {
    const { projects, grand_total, languages, categories, editors } = summary[0]

    return `## Wakatime Daily Report\nTotal: ${grand_total.text}\n${getItemContent(
      'Projects',
      projects
    )}\n${getItemContent('Languages', languages)}\n${getItemContent(
      'Editors',
      editors
    )}\n${getItemContent('Categories', categories)}\n`
  }
}

/**
 * 获取 Wakatime 某一天的 summary 数据
 * @param {string} date - 日期 (格式: YYYY-MM-DD)
 */
function getMySummary(date) {
  return get(summariesApi, {
    params: {
      start: date,
      end: date
    },
    auth: {
      username: WAKATIME_API_KEY,
      password: '' // 密码留空
    }
  }).then(response => response.data)
}

/**
 * 将统计数据更新到 GitHub Gist
 * @param {string} date - 日期
 * @param {object} content - 要上传的内容对象
 */
async function updateGist(date, content) {
  try {
    await octokit.gists.update({
      gist_id: GIST_ID,
      files: {
        [`summaries_${date}.json`]: {
          content: JSON.stringify(content, null, 2)
        }
      }
    })
    console.log(`✅ 成功更新 Gist: summaries_${date}.json`)
  } catch (error) {
    console.error(`❌ 无法更新 Gist: ${error.message}`)
  }
}

/**
 * 带重试机制的获取并上传数据流程
 * @param {number} times - 剩余重试次数
 */
async function fetchSummaryWithRetry(times) {
  const yesterday = dayjs()
    .subtract(1, 'day')
    .format('YYYY-MM-DD')

  try {
    const mySummary = await getMySummary(yesterday)
    await updateGist(yesterday, mySummary.data)
  } catch (error) {
    if (times <= 1) {
      console.error(`❌ 获取 Wakatime 数据失败: ${error.message}`)
      return
    }
    console.log(`⚠️ 获取失败，重试中... 剩余次数：${times - 1}`)
    await fetchSummaryWithRetry(times - 1)
  }
}

// 主入口
async function main() {
  await fetchSummaryWithRetry(3)
}

main()
