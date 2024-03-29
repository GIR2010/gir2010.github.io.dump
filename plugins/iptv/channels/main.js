import Api from '../utils/api'
import Icons from './icons'
import Details from './details'
import Menu from './menu'
import EPG from '../utils/epg'
import Utils from '../utils/utils'
import Url from '../utils/url'
import Favorites from '../utils/favorites'
import HUD from '../hud/hud'

class Channels{
    constructor(listener){
        this.listener = listener

        this.html  = Lampa.Template.js('cub_iptv_content')

        this.inner_listener = Lampa.Subscribe()

        this.menu    = new Menu(this.inner_listener)
        this.icons   = new Icons(this.inner_listener)
        this.details = new Details(this.inner_listener)

        this.inner_listener.follow('toggle',name=>{
            this[name].toggle()

            this.active = this[name]
        })

        this.inner_listener.follow('back',()=>{
            this.listener.send('playlist-main')
        })

        this.inner_listener.follow('play',this.playChannel.bind(this))

        this.inner_listener.follow('play-archive',this.playArchive.bind(this))

        this.active = this.menu

        this.html.find('.iptv-content__menu').append(this.menu.render())
        this.html.find('.iptv-content__channels').append(this.icons.render())
        this.html.find('.iptv-content__details').append(this.details.render())
    }

    build(data){
        this.empty = false

        this.menu.build(data)

        this.listener.send('display',this)
    }

    playArchive(data){
        let convert = (p)=>{
            let item = {
                title: Lampa.Utils.parseTime(p.start).time + ' - ' + Lampa.Utils.capitalizeFirstLetter(p.title),
            }

            item.url = Url.catchupUrl(data.channel.url, data.channel.catchup.type, data.channel.catchup.source)
            item.url = Url.prepareUrl(item.url, p)

            item.need_check_live_stream = true

            return item
        }

        Lampa.Player.runas(Lampa.Storage.field('player_iptv'))

        Lampa.Player.play(convert(data.program))
        Lampa.Player.playlist(data.playlist.map(convert))
    }

    playChannel(data){
        let cache = {}
            cache.none = []

        let time
        let update

        let start_channel = Lampa.Arrays.clone(this.icons.icons_clone[data.position])
            start_channel.original = this.icons.icons_clone[data.position]

        data.url = Url.prepareUrl(start_channel.url)

        if(this.archive && this.archive.channel == start_channel.original){
            data.url = Url.catchupUrl(this.archive.channel.url, this.archive.channel.catchup.type, this.archive.channel.catchup.source)
            data.url = Url.prepareUrl(data.url, this.archive.program)
        }

        data.onGetChannel = (position)=>{
            let original  = this.icons.icons_clone[position]
            let channel   = Lampa.Arrays.clone(original)
            let timeshift = this.archive && this.archive.channel == original ? this.archive.timeshift : 0

            channel.name  = Utils.clearChannelName(channel.name)
            channel.group = Utils.clearMenuName(channel.group)
            channel.url   = Url.prepareUrl(channel.url)
            channel.icons = []

            channel.original = original
            
            if(timeshift){
                channel.shift = timeshift

                channel.url = Url.catchupUrl(original.url, channel.catchup.type, channel.catchup.source)
                channel.url = Url.prepareUrl(channel.url, this.archive.program)
            }

            if(Boolean(Favorites.find(channel))){
                channel.icons.push(`
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" xml:space="preserve">
                        <path fill="currentColor" d="M391.416,0H120.584c-17.778,0-32.242,14.464-32.242,32.242v460.413c0,7.016,3.798,13.477,9.924,16.895
                        c2.934,1.638,6.178,2.45,9.421,2.45c3.534,0,7.055-0.961,10.169-2.882l138.182-85.312l138.163,84.693
                        c5.971,3.669,13.458,3.817,19.564,0.387c6.107-3.418,9.892-9.872,9.892-16.875V32.242C423.657,14.464,409.194,0,391.416,0z
                        M384.967,457.453l-118.85-72.86c-6.229-3.817-14.07-3.798-20.28,0.032l-118.805,73.35V38.69h257.935V457.453z"></path>
                    </svg>
                `)
            }

            update = false

            if(channel.id){
                if(!cache[channel.id]){
                    cache[channel.id] = []

                    Api.program({
                        name: channel.name,
                        channel_id: channel.id,
                        tvg: channel.tvg,
                        time: EPG.time(channel,timeshift)
                    }).then(program=>{
                        cache[channel.id] = program
                    }).finally(()=>{
                        Lampa.Player.programReady({
                            channel: channel,
                            position: EPG.position(channel, cache[channel.id], timeshift),
                            total: cache[channel.id].length
                        })
                    })
                }
                else{
                    Lampa.Player.programReady({
                        channel: channel,
                        position: EPG.position(channel, cache[channel.id], timeshift),
                        total: cache[channel.id].length
                    })
                }
            }
            else{
                Lampa.Player.programReady({
                    channel: channel,
                    position: 0,
                    total: 0
                })
            }

            return channel
        }

        data.onMenu = (channel)=>{
            this.hud = new HUD(channel)

            this.hud.listener.follow('close',()=>{
                this.hud = this.hud.destroy()

                Lampa.Controller.toggle('player_tv')
            })

            this.hud.listener.follow('get_program_endless',()=>{
                let program = cache[channel.id || 'none']

                let endless = this.details.playlist(channel, program, {
                    onPlay: (param)=>{
                        Lampa.Player.close()
    
                        this.playArchive(param)
                    }
                })

                this.hud.listener.send('set_program_endless',{endless})
            })

            this.hud.listener.follow('action-favorite',()=>{
                Lampa.PlayerIPTV.redrawChannel()

                this.inner_listener.send('update-favorites')
            })

            this.hud.create()
        }

        //устарело, потом удалить
        data.onPlaylistProgram = (channel)=>{
            let program = cache[channel.id || 'none']

            if(!program.length) return

            let html = document.createElement('div')

            html.style.lineHeight = '1.4'

            Lampa.Modal.open({
                title: '',
                size: 'medium',
                html: $(html)
            })

            let endless = this.details.playlist(channel, program, {
                onPlay: (param)=>{
                    Lampa.Modal.close()
                    Lampa.Player.close()

                    this.playArchive(param)
                }
            })

            html.append(endless.render())

            Lampa.Controller.add('modal',{
                invisible: true,
                toggle: ()=>{
                    Lampa.Controller.collectionSet(html)
                    Lampa.Controller.collectionFocus(false,html)
                },
                up: ()=>{
                    endless.move(-1)

                    Lampa.Controller.collectionSet(html)
                    Lampa.Controller.collectionFocus(false,html)
                },
                down: ()=>{
                    endless.move(1)

                    Lampa.Controller.collectionSet(html)
                    Lampa.Controller.collectionFocus(false,html)
                },
                back: ()=>{
                    Lampa.Modal.close()

                    Lampa.Controller.toggle('player_tv')
                }
            })
            
            Lampa.Controller.toggle('modal')
        }

        data.onPlay = (channel)=>{
            if(channel.original.added){
                channel.original.view++

                Favorites.update(channel.original)
            }
        }

        data.onGetProgram = (channel, position, container)=>{
            update = false

            let timeshift = channel.shift || 0

            let program = cache[channel.id || 'none']
            let noprog  = document.createElement('div')
                noprog.addClass('player-panel-iptv-item__prog-load')
                noprog.text(Lampa.Lang.translate('iptv_noprogram'))

            container[0].empty().append(noprog)

            if(program.length){
                let start = EPG.position(channel, program, timeshift)
                let list  = program.slice(position, position + 2)
                let now   = program[start]

                if(list.length) container[0].empty()

                list.forEach(prog=>{
                    let item = document.createElement('div')
                        item.addClass('player-panel-iptv-item__prog-item')

                    let span = document.createElement('span')
                        span.html(Lampa.Utils.parseTime(prog.start).time + (now == prog ? ' - ' + Lampa.Utils.parseTime(prog.stop).time : '') + ' &nbsp; ' + Utils.clear(prog.title))

                    item.append(span)

                    if(now == prog){
                        item.addClass('watch')

                        let timeline = document.createElement('div')
                            timeline.addClass('player-panel-iptv-item__prog-timeline')
                        
                        let div = document.createElement('div')
                            div.style.width = EPG.timeline(channel, prog, timeshift) + '%'

                        timeline.append(div)

                        update = ()=>{
                            let percent = EPG.timeline(channel, prog, timeshift)

                            div.style.width = percent + '%'

                            if(percent == 100){
                                let next = EPG.position(channel, program, timeshift)

                                if(start !== next){
                                    Lampa.Player.programReady({
                                        channel: channel,
                                        position: next,
                                        total: cache[channel.id].length
                                    })
                                }
                            }
                        }

                        item.append(timeline)
                    }

                    container[0].append(item)
                })
            }
        }

        Lampa.Player.iptv(data)

        time = setInterval(()=>{
            if(update) update()
        },1000 * 10)

        let destroy = ()=>{
            Lampa.Player.listener.remove('destroy', destroy)

            cache  = null
            update = null

            this.archive = false

            if(this.hud) this.hud = this.hud.destroy()

            clearInterval(time)
        }

        Lampa.Player.listener.follow('destroy',destroy)
    }

    toggle(){
        if(this.empty){
            Lampa.Controller.add('content',{
                invisible: true,
                toggle: ()=>{
                    Lampa.Controller.clear()
                },
                left: ()=>{
                    Lampa.Controller.toggle('menu')
                },
                up: ()=>{
                    Lampa.Controller.toggle('head')
                },
                back: ()=>{
                    this.listener.send('playlist-main')
                }
            })
    
            Lampa.Controller.toggle('content')
        }
        else this.active.toggle()
    }

    render(){
        return this.empty ? this.empty.render(true) : this.html
    }

    load(playlist){
        this.listener.send('loading')

        Api.playlist(playlist).then(this.build.bind(this)).catch(e=>{
            this.empty = new Lampa.Empty({descr: '<div style="width: 60%; margin:0 auto; line-height: 1.4">'+Lampa.Lang.translate('iptv_noload_playlist')+'</div>'})

            this.listener.send('display',this)
        })
    }

    destroy(){
        this.menu.destroy()
        this.icons.destroy()
        this.details.destroy()

        this.inner_listener.destroy()

        this.active = false

        this.epg_cache = null

        this.html.remove()
    }
}

export default Channels