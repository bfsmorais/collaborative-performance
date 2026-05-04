# Collaborative Performance

Uma rede musical colaborativa onde várias pessoas, em sítios e momentos diferentes, vão construindo canções em conjunto — cada uma junta o seu instrumento ou a sua letra, e a música cresce a partir daí.

Projeto individual da cadeira de Computação Social e Colaborativa (Mestrado em Engenharia Informática, Universidade de Coimbra, 2025/2026).

## A ideia

Cada canção começa com o contributo de alguém: um riff, uma batida, uma letra. Outras pessoas podem juntar-se e acrescentar a sua parte. Quando uma canção reúne dois instrumentos e uma letra fica completa e entra no álbum coletivo. Dez canções fecham o álbum e começa um novo ciclo.

A ideia é simples: em vez de se ouvir música feita por outros, as pessoas fazem música umas com as outras — mesmo sem se conhecerem e sem estarem no mesmo sítio ou à mesma hora.

## Como está feito

O frontend é HTML, CSS e JavaScript, sem framework. O backend é o Supabase, que trata da autenticação, da base de dados, do armazenamento dos áudios e do tempo real (chat e presença). A rede de canções e participantes é desenhada com a biblioteca vis-network.

## O que dá para fazer

- Criar canções e juntar-se às que já existem
- Carregar um instrumento (áudio) ou escrever a letra
- Ver quem está numa canção naquele momento e falar por chat em tempo real
- Tocar todos os instrumentos de uma canção ao mesmo tempo
- Ver tudo como uma rede que liga canções e participantes
- Acompanhar o álbum coletivo a formar-se

## Limitações

Não há chamada de áudio/vídeo — a colaboração em tempo real é feita pelo chat e pelo indicador de presença. Também não há editor de áudio: os contributos são ficheiros já gravados. As versões alternativas de uma canção e a recomendação de canções conforme o instrumento de cada um ficaram como ideias para continuar.
