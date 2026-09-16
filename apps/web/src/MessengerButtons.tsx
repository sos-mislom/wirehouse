import {useState} from 'react';
type Channel = {id:string;label:string;url:string;enabled:boolean;instruction?:string};
export function MessengerLogo({channel}:{channel:string}) {
  return channel === 'vk' ? <svg aria-hidden="true" viewBox="5 5 19 19"><path fill="currentColor" d="m14.7065 18.9c-5.02244 0-7.88712-3.4534-8.00649-9.19999h2.5158c.08263 4.21779 1.93729 6.00439 3.40639 6.37279v-6.37279h2.369v3.63759c1.4507-.1565 2.9747-1.8142 3.4889-3.63759h2.3689c-.3948 2.24709-2.0475 3.90469-3.2228 4.58619 1.1753.5525 3.0576 1.9984 3.7738 4.6138h-2.6077c-.5601-1.7497-1.9556-3.1035-3.8011-3.2877v3.2877z"/></svg> : <svg aria-hidden="true" viewBox="18 25 90 90"><path fill="currentColor" d="M28.9700376,63.3244248 C47.6273373,55.1957357 60.0684594,49.8368063 66.2934036,47.2476366 C84.0668845,39.855031 87.7600616,38.5708563 90.1672227,38.528 C90.6966555,38.5191258 91.8804274,38.6503351 92.6472251,39.2725385 C93.294694,39.7979149 93.4728387,40.5076237 93.5580865,41.0057381 C93.6433345,41.5038525 93.7494885,42.63857 93.6651041,43.5252052 C92.7019529,53.6451182 88.5344133,78.2034783 86.4142057,89.5379542 C85.5170662,94.3339958 83.750571,95.9420841 82.0403991,96.0994568 C78.3237996,96.4414641 75.5015827,93.6432685 71.9018743,91.2836143 C66.2690414,87.5912212 63.0868492,85.2926952 57.6192095,81.6896017 C51.3004058,77.5256038 55.3966232,75.2369981 58.9976911,71.4967761 C59.9401076,70.5179421 76.3155302,55.6232293 76.6324771,54.2720454 C76.6721165,54.1030573 76.7089039,53.4731496 76.3346867,53.1405352 C75.9604695,52.8079208 75.4081573,52.921662 75.0095933,53.0121213 C74.444641,53.1403447 65.4461175,59.0880351 48.0140228,70.8551922 C45.4598218,72.6091037 43.1463059,73.4636682 41.0734751,73.4188859 C38.7883453,73.3695169 34.3926725,72.1268388 31.1249416,71.0646282 C27.1169366,69.7617838 23.931454,69.0729605 24.208838,66.8603276 C24.3533167,65.7078514 25.9403832,64.5292172 28.9700376,63.3244248 Z"/></svg>;
}
export function MessengerButtons({channels, showInstructions = false}:{channels:Channel[];showInstructions?:boolean}) {
  return <div className="tenant-channel-grid">{channels.filter(c => ['telegram','vk'].includes(c.id)).map(channel => (
    <div className="messenger-option" key={channel.id}>
      {channel.enabled && channel.url ? <a className={`tenant-channel tenant-channel--${channel.id}`} href={channel.url} target="_blank" rel="noopener noreferrer" aria-label={`Открыть ${channel.label}`}><MessengerLogo channel={channel.id}/><span>{channel.label}</span></a> : <span className="tenant-channel tenant-channel--disabled" aria-disabled="true"><MessengerLogo channel={channel.id}/><span>{channel.label}<small>Временно недоступен</small></span></span>}
      {showInstructions && <p>{channel.id === 'telegram' ? 'В боте нажмите «Поделиться телефоном». Номер должен совпадать с указанным в договоре.' : 'Отправьте боту код привязки из кабинета или от управляющего.'}</p>}
    </div>
  ))}</div>;
}

const apiBase=import.meta.env.VITE_WAREHOUSE_API_BASE_URL || (['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:3001':'');
export function BotLinkPanel({token,userId}:{token:string;userId?:string}) {
  const [result,setResult]=useState<{command:string;channel:string;expiresAt:string}|null>(null);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [copied,setCopied]=useState(false);
  async function issue(channel:string) {
    setBusy(true);setError('');setResult(null);setCopied(false);
    try {const response=await fetch(`${apiBase}/api/integrations/link-code`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({channel,userId})});const data=await response.json();if(!response.ok)throw new Error(data.error || 'Не удалось получить код');setResult(data);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <details className="bot-link-panel"><summary>Подключение мессенджеров</summary><p>{userId ? 'Выдайте пользователю одноразовый код для отправки боту.' : 'Получите код и отправьте его боту со своего аккаунта. После привязки сюда будут приходить коды входа.'}</p><div className="tenant-channel-grid">{['telegram','vk'].map(channel=><button className={`tenant-channel tenant-channel--${channel}`} key={channel} type="button" disabled={busy} onClick={()=>void issue(channel)}><MessengerLogo channel={channel}/><span>{channel==='vk'?'VK':'Telegram'}</span></button>)}</div>{error&&<p role="alert" className="ops-error">{error}</p>}{result&&<div className="bot-link-result" role="status"><p>Отправьте боту {result.channel==='vk'?'VK':'Telegram'}:</p><code>{result.command}</code><small>Код действует 15 минут и используется один раз.</small><button className="secondary-button" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(result.command);setCopied(true);}catch{setError('Выделите и скопируйте команду вручную');}}}>{copied?'Скопировано':'Скопировать команду'}</button></div>}</details>;
}
