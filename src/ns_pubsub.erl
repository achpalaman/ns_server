%% @author Northscale <info@northscale.com>
%% @copyright 2009 NorthScale, Inc.
%%
%% Licensed under the Apache License, Version 2.0 (the "License");
%% you may not use this file except in compliance with the License.
%% You may obtain a copy of the License at
%%
%%      http://www.apache.org/licenses/LICENSE-2.0
%%
%% Unless required by applicable law or agreed to in writing, software
%% distributed under the License is distributed on an "AS IS" BASIS,
%% WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
%% See the License for the specific language governing permissions and
%% limitations under the License.

-module(ns_pubsub).

-include("ns_common.hrl").

-behaviour(gen_event).

-record(state, {func, func_state}).

%% API
-export([subscribe_link/1, subscribe_link/3, unsubscribe/1]).

%% gen_event callbacks
-export([code_change/3, init/1, handle_call/2, handle_event/2, handle_info/2,
         terminate/2]).

%% called by proc_lib:start from subscribe_link/3
-export([do_subscribe_link/4]).


%%
%% API
%%
subscribe_link(Name) ->
    subscribe_link(Name, msg_fun(self()), ignored).


subscribe_link(Name, Fun, State) ->
    proc_lib:start(?MODULE, do_subscribe_link, [Name, Fun, State, self()]).


unsubscribe(Pid) ->
    Pid ! unsubscribe,
    misc:wait_for_process(Pid, infinity),

    %% consume exit message in case trap_exit is true
    receive
        %% we expect the process to die normally; if it's not the case then
        %% this should be handled explicitly by parent process;
        {'EXIT', Pid, normal} ->
            ok
    after 0 ->
            ok
    end.

%%
%% gen_event callbacks
%%
code_change(_OldVsn, State, _Extra) ->
    {ok, State}.


init(State) ->
    {ok, State}.


handle_call(_Request, State) ->
    {reply, ok, State}.


handle_event(Event, State = #state{func=Fun, func_state=FS}) ->
    NewState = Fun(Event, FS),
    {ok, State#state{func_state=NewState}}.


handle_info(_Msg, State) ->
    {ok, State}.


terminate(_Args, _State) ->
    ok.


%%
%% Internal functions
%%

%% Function sending a message to a pid
msg_fun(Pid) ->
    fun (Event, ignored) ->
            Pid ! Event,
            ignored
    end.


do_subscribe_link(Name, Fun, State, Parent) ->
    process_flag(trap_exit, true),
    erlang:link(Parent),

    Ref = make_ref(),
    Handler = {?MODULE, Ref},
    ok = gen_event:add_sup_handler(Name, Handler,
                                   #state{func=Fun, func_state=State}),

    proc_lib:init_ack(Parent, self()),

    ExitReason =
        receive
            unsubscribe ->
                normal;
            {'gen_event_EXIT', Handler, Reason} ->
                case Reason =:= normal orelse Reason =:= shutdown of
                    true ->
                        normal;
                    false ->
                        {handler_crashed, Name, Reason}
                end;
            {'EXIT', Parent, Reason} ->
                ?log_debug("Parent process exited with reason ~p",
                           [Reason]),
                normal;
            {'EXIT', Pid, Reason} ->
                ?log_error("Dying because linked process ~p died: ~p",
                           [Pid, Reason]),
                {linked_process_died, Pid, Reason};
            X ->
                ?log_error("Got unexpected message: ~p", [X]),
                unexpected_message
        end,

    R = (catch gen_event:delete_handler(Name, Handler, unused)),
    ?log_debug("Deleting ~p event handler: ~p", [Handler, R]),

    exit(ExitReason).
