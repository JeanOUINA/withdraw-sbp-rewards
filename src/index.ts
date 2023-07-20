import * as dotenv from "dotenv"
import { join } from "path"
import __dirname from "./__dirname.js"
dotenv.config({
    path: join(__dirname, "../.env")
})
import * as vite from "web3-vite"
import ConsensusContract from "web3-vite/dist/contracts/Consensus.js"
import * as Discord from "discord.js"
import { viteTokenId } from "web3-vite/dist/constants.js"
import BigNumber from "bignumber.js"

const mnemonics:string = process.env.mnemonics
if(!mnemonics){
    console.error(`Panic; Missing mnemonics`)
    process.exit(1)
}
const sbp:string = process.env.sbp
if(!sbp){
    console.error(`Panic; Missing sbp name`)
    process.exit(1)
}
const webhookUrl:string = process.env.webhook
if(!webhookUrl){
    console.error(`Panic; Missing webhook url`)
    process.exit(1)
}

const client = new vite.Client("https://node-vite.thomiz.dev/")
const webhook = new Discord.WebhookClient({
    url: webhookUrl
})

const wallet = new vite.WalletMnemonics(mnemonics)
const address = wallet.mainAddress
console.log(`Using ${address.address}`)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const consensus:ConsensusContract = new ConsensusContract.default(client)
const formatter = new Intl.NumberFormat("en-US")

// Receive everything
await receiveAll()

const rewardInfo = await consensus.getSBPRewardPendingWithdrawal(sbp)
if(rewardInfo.totalReward !== "0"){
    await consensus.methods.WithdrawSBPReward.call([sbp, address.address], address)
    console.log(`Withdrew Rewards`)

    // wait 10 seconds
    await vite.wait(10*1000)
    
    // receive rewards
    await receiveAll()
}
process.exit(0)

export async function receiveAll(){
    const unreceived = await client.methods.ledger.getUnreceivedBlocksByAddress(address.address, 0, 1000)
    for(const block of unreceived){
        const accountBlock = vite.AccountBlock.receive(client, {
            producer: address.address,
            sendBlockHash: block.hash
        })
        await accountBlock.getPreviousHash()
        await accountBlock.getDifficulty()
        await accountBlock.computePoW()

        await address.signAccountBlock(accountBlock)

        await accountBlock.broadcast()
        console.log(`Received ${block.hash}`)
        
        if(block.tokenId !== viteTokenId)continue

        const amount = formatter.format(new BigNumber(block.amount)
            .shiftedBy(-18)
            .toNumber())
            
        const embed = new Discord.EmbedBuilder()
            .setColor("#000000")
            .setTitle("SBP Reward Received!")
            .setDescription(`The ${sbp} SBP generated a total of **${amount} VITE**
            
[View on VITCScan](https://vitcscan.com/tx/${block.hash})`)
        await webhook.send({
            embeds: [embed]
        }).catch(() => {})
    }
}